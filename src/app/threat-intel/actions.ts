"use server";

import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

export type EnvCve = {
  cve: string;
  assets: number; // distinct IPs affected
  ports: number[];
  services: string[];
  firstSeen: string | null;
  lastSeen: string | null;
};

export type EnvCvesResult =
  | { ok: false; message: string }
  | {
      ok: true;
      cves: EnvCve[];
      totalCves: number;
      totalAffectedAssets: number;
      scannedPorts: number;
    };

function parseVulnIds(raw: unknown): string[] {
  if (raw == null) return [];
  const text = String(raw).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    return text.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Aggregate the CVEs actually present across the saved attack surface.
 * Uses the real CVE identifiers stored in saved_ports.vuln_ids.
 */
export async function getEnvironmentCves(): Promise<EnvCvesResult> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT ip, port, service, vuln_ids, scanned_at
       FROM saved_ports
       WHERE vuln_ids IS NOT NULL AND vuln_ids <> '' AND vuln_ids <> '[]'
       LIMIT 20000`,
    );

    const map = new Map<
      string,
      {
        ips: Set<string>;
        ports: Set<number>;
        services: Set<string>;
        first: number | null;
        last: number | null;
      }
    >();

    let scannedPorts = 0;

    for (const row of rows) {
      const ids = parseVulnIds(row.vuln_ids);
      if (!ids.length) continue;
      scannedPorts++;
      const ts = row.scanned_at ? new Date(row.scanned_at).getTime() : null;
      const port = Number(row.port);
      const service = row.service ? String(row.service) : "";

      for (const id of ids) {
        const cve = id.trim().toUpperCase();
        if (!/^CVE-\d{4}-\d{4,}$/.test(cve)) continue;
        let e = map.get(cve);
        if (!e) {
          e = {
            ips: new Set(),
            ports: new Set(),
            services: new Set(),
            first: ts,
            last: ts,
          };
          map.set(cve, e);
        }
        e.ips.add(String(row.ip));
        if (Number.isInteger(port)) e.ports.add(port);
        if (service) e.services.add(service);
        if (ts != null) {
          if (e.first == null || ts < e.first) e.first = ts;
          if (e.last == null || ts > e.last) e.last = ts;
        }
      }
    }

    const cves: EnvCve[] = Array.from(map.entries())
      .map(([cve, e]) => ({
        cve,
        assets: e.ips.size,
        ports: Array.from(e.ports).sort((a, b) => a - b),
        services: Array.from(e.services).sort(),
        firstSeen: e.first == null ? null : new Date(e.first).toISOString(),
        lastSeen: e.last == null ? null : new Date(e.last).toISOString(),
      }))
      .sort((a, b) => b.assets - a.assets || a.cve.localeCompare(b.cve));

    const totalAffectedAssets = new Set<string>();
    for (const row of rows) totalAffectedAssets.add(String(row.ip));

    return {
      ok: true,
      cves,
      totalCves: cves.length,
      totalAffectedAssets: totalAffectedAssets.size,
      scannedPorts,
    };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR") {
      return {
        ok: false,
        message:
          'ยังไม่มีข้อมูล CVE — รัน migration (vuln_ids) แล้วกด SCAN FOR CVEs ในหน้า Vuln Analysis ก่อน',
      };
    }
    return { ok: false, message: "โหลดข้อมูล Threat Intel ไม่สำเร็จ" };
  }
}

export type RadarBatchResult =
  | { ok: false; message: string }
  | { ok: true; ips: string[]; remaining: number };

/**
 * Next batch of IPs for the auto radar to sweep. Prioritises IPs never pulled
 * into saved_ports, then the ones scanned longest ago, so the radar cycles the
 * whole fleet over time instead of re-hitting the same targets.
 */
export async function getRadarBatch(limit = 12): Promise<RadarBatchResult> {
  const n = Math.min(Math.max(Math.floor(limit) || 1, 1), 40);
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT si.ip
       FROM saved_ips si
       LEFT JOIN (
         SELECT ip, MAX(scanned_at) AS ls FROM saved_ports GROUP BY ip
       ) sp ON sp.ip = si.ip
       ORDER BY (sp.ls IS NOT NULL), sp.ls ASC, si.id ASC
       LIMIT ?`,
      [n],
    );
    const [[cnt]] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM saved_ips`,
    );
    return {
      ok: true,
      ips: rows.map((r) => String(r.ip)),
      remaining: Number(cnt?.n ?? 0),
    };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "ER_NO_SUCH_TABLE") {
      return { ok: false, message: "ยังไม่มีตาราง saved_ips" };
    }
    return { ok: false, message: "ดึงเป้าหมายสำหรับเรดาร์ไม่สำเร็จ" };
  }
}

export type CveDetail =
  | { ok: false; cve: string; message: string }
  | {
      ok: true;
      cve: string;
      cvss: number | null;
      severity: string | null;
      vector: string | null;
      published: string | null;
      description: string;
      source: "nvd" | "fallback";
    };

const SEV_FROM_SCORE = (s: number): string =>
  s >= 9 ? "CRITICAL" : s >= 7 ? "HIGH" : s >= 4 ? "MEDIUM" : s > 0 ? "LOW" : "NONE";

/**
 * Enrich a single CVE with real CVSS + description from the NVD API 2.0.
 * Keyless, rate-limited; falls back gracefully when unreachable.
 */
export async function getCveDetail(cveId: string): Promise<CveDetail> {
  const cve = (cveId || "").trim().toUpperCase();
  if (!/^CVE-\d{4}-\d{4,}$/.test(cve)) {
    return { ok: false, cve, message: "รูปแบบ CVE-ID ไม่ถูกต้อง" };
  }

  try {
    const res = await fetch(
      `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(cve)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(9000),
        cache: "no-store",
      },
    );
    if (!res.ok) throw new Error(`NVD status ${res.status}`);

    const data = (await res.json()) as {
      vulnerabilities?: {
        cve?: {
          published?: string;
          descriptions?: { lang: string; value: string }[];
          metrics?: Record<
            string,
            { cvssData?: { baseScore?: number; baseSeverity?: string; vectorString?: string } }[]
          >;
        };
      }[];
    };

    const entry = data.vulnerabilities?.[0]?.cve;
    if (!entry) {
      return {
        ok: false,
        cve,
        message: "NVD ไม่มีข้อมูลสำหรับ CVE นี้ (อาจเป็น CVE จำลอง/ยังไม่เผยแพร่)",
      };
    }

    const desc =
      entry.descriptions?.find((d) => d.lang === "en")?.value ??
      entry.descriptions?.[0]?.value ??
      "ไม่มีคำอธิบาย";

    const metrics = entry.metrics ?? {};
    const metricKey =
      ["cvssMetricV31", "cvssMetricV30", "cvssMetricV2"].find(
        (k) => Array.isArray(metrics[k]) && metrics[k].length,
      ) ?? null;
    const cvssData = metricKey ? metrics[metricKey]?.[0]?.cvssData : undefined;
    const score = typeof cvssData?.baseScore === "number" ? cvssData.baseScore : null;
    const severity =
      cvssData?.baseSeverity ?? (score != null ? SEV_FROM_SCORE(score) : null);

    return {
      ok: true,
      cve,
      cvss: score,
      severity: severity ?? null,
      vector: cvssData?.vectorString ?? null,
      published: entry.published ?? null,
      description: desc,
      source: "nvd",
    };
  } catch {
    return {
      ok: false,
      cve,
      message: "เชื่อมต่อ NVD ไม่สำเร็จ (timeout/offline) — ลองใหม่อีกครั้ง",
    };
  }
}
