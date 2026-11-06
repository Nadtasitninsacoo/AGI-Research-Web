"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type NvdSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type EnvCve = {
  cve: string;
  assets: number; // distinct IPs affected
  ports: number[];
  services: string[];
  firstSeen: string | null;
  lastSeen: string | null;
  // NVD enrichment (null until enriched):
  cvss: number | null;
  nvdSeverity: NvdSeverity | null;
  enriched: boolean;
};

export type EnvCvesResult =
  | { ok: false; message: string }
  | {
      ok: true;
      cves: EnvCve[];
      totalCves: number;
      totalAffectedAssets: number;
      scannedPorts: number;
      enrichedCount: number;
    };

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
      source: "nvd" | "cache";
    };

export type EnrichResult = {
  requested: number;
  fetched: number;
  cached: number;
  rateLimited: boolean;
  message: string;
};

export type RadarBatchResult =
  | { ok: false; message: string }
  | { ok: true; ips: string[]; remaining: number };

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// Re-fetch an entry from NVD only after this long (cache TTL).
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const NVD_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function nvdHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  const key = process.env.NVD_API_KEY?.trim();
  if (key) h.apiKey = key;
  return h;
}
// Without an API key NVD allows ~5 requests / 30s; with a key ~50 / 30s.
const nvdSpacingMs = () => (process.env.NVD_API_KEY?.trim() ? 350 : 900);

function severityFromScore(s: number | null): NvdSeverity | null {
  if (s == null) return null;
  if (s >= 9) return "CRITICAL";
  if (s >= 7) return "HIGH";
  if (s >= 4) return "MEDIUM";
  if (s > 0) return "LOW";
  return "NONE";
}

const isCve = (s: string) => /^CVE-\d{4}-\d{4,}$/.test(s);

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

type NvdParsed = {
  ok: boolean;
  status: "ok" | "notfound" | "error";
  cvss: number | null;
  severity: NvdSeverity | null;
  vector: string | null;
  published: string | null;
  description: string | null;
};

// One NVD request for a single CVE. Returns a normalized record or an error
// marker (never throws). Caller handles rate-limit backoff.
async function fetchNvd(cve: string): Promise<NvdParsed & { rateLimited?: boolean }> {
  try {
    const res = await fetch(`${NVD_BASE}?cveId=${encodeURIComponent(cve)}`, {
      headers: nvdHeaders(),
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });

    if (res.status === 403 || res.status === 429) {
      return {
        ok: false,
        status: "error",
        cvss: null,
        severity: null,
        vector: null,
        published: null,
        description: null,
        rateLimited: true,
      };
    }
    if (!res.ok) throw new Error(`status ${res.status}`);

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
        ok: true,
        status: "notfound",
        cvss: null,
        severity: null,
        vector: null,
        published: null,
        description: null,
      };
    }

    const desc =
      entry.descriptions?.find((d) => d.lang === "en")?.value ??
      entry.descriptions?.[0]?.value ??
      null;
    const metrics = entry.metrics ?? {};
    const key =
      ["cvssMetricV31", "cvssMetricV30", "cvssMetricV2"].find(
        (k) => Array.isArray(metrics[k]) && metrics[k].length,
      ) ?? null;
    const data0 = key ? metrics[key]?.[0]?.cvssData : undefined;
    const score = typeof data0?.baseScore === "number" ? data0.baseScore : null;

    return {
      ok: true,
      status: "ok",
      cvss: score,
      severity: data0?.baseSeverity
        ? (data0.baseSeverity.toUpperCase() as NvdSeverity)
        : severityFromScore(score),
      vector: data0?.vectorString ?? null,
      published: entry.published ?? null,
      description: desc,
    };
  } catch {
    return {
      ok: false,
      status: "error",
      cvss: null,
      severity: null,
      vector: null,
      published: null,
      description: null,
    };
  }
}

type IntelRow = {
  cve_id: string;
  cvss: number | null;
  severity: string | null;
  vector: string | null;
  published: string | null;
  description: string | null;
  status: string;
  fetched_at: string | null;
};

async function readIntel(cveIds: string[]): Promise<Map<string, IntelRow>> {
  const map = new Map<string, IntelRow>();
  if (!cveIds.length) return map;
  let rows: RowDataPacket[];
  try {
    [rows] = await db.query<RowDataPacket[]>(
      `SELECT cve_id, cvss, severity, vector, published, description, status, fetched_at
       FROM cve_intel WHERE cve_id IN (?)`,
      [cveIds],
    );
  } catch (e) {
    // cve_intel not created yet → behave as an empty cache (nothing enriched).
    if ((e as { code?: string })?.code === "ER_NO_SUCH_TABLE") return map;
    throw e;
  }
  for (const r of rows) {
    map.set(String(r.cve_id), {
      cve_id: String(r.cve_id),
      cvss: r.cvss == null ? null : Number(r.cvss),
      severity: r.severity == null ? null : String(r.severity),
      vector: r.vector == null ? null : String(r.vector),
      published: r.published == null ? null : String(r.published),
      description: r.description == null ? null : String(r.description),
      status: String(r.status ?? "ok"),
      fetched_at: r.fetched_at ? new Date(r.fetched_at).toISOString() : null,
    });
  }
  return map;
}

async function upsertIntel(cve: string, p: NvdParsed): Promise<void> {
  await db.query<ResultSetHeader>(
    `INSERT INTO cve_intel (cve_id, cvss, severity, vector, published, description, source, status, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, 'nvd', ?, NOW())
     ON DUPLICATE KEY UPDATE
       cvss=VALUES(cvss), severity=VALUES(severity), vector=VALUES(vector),
       published=VALUES(published), description=VALUES(description),
       status=VALUES(status), fetched_at=NOW()`,
    [
      cve,
      p.cvss,
      p.severity,
      p.vector,
      p.published,
      p.description,
      p.status,
    ],
  );
}

function isStale(row: IntelRow | undefined): boolean {
  if (!row) return true;
  if (row.status === "error") return true; // retry errors
  if (!row.fetched_at) return true;
  return Date.now() - new Date(row.fetched_at).getTime() > CACHE_TTL_MS;
}

// ─────────────────────────────────────────────────────────────
// Public actions
// ─────────────────────────────────────────────────────────────

/**
 * Aggregate CVEs present across the saved attack surface, enriched with any
 * cached NVD CVSS data. Severity prefers the real NVD score when available.
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
      { ips: Set<string>; ports: Set<number>; services: Set<string>; first: number | null; last: number | null }
    >();
    let scannedPorts = 0;
    const allIps = new Set<string>();

    for (const row of rows) {
      const ids = parseVulnIds(row.vuln_ids);
      if (!ids.length) continue;
      scannedPorts++;
      allIps.add(String(row.ip));
      const ts = row.scanned_at ? new Date(row.scanned_at).getTime() : null;
      const port = Number(row.port);
      const service = row.service ? String(row.service) : "";
      for (const id of ids) {
        const cve = id.trim().toUpperCase();
        if (!isCve(cve)) continue;
        let e = map.get(cve);
        if (!e) {
          e = { ips: new Set(), ports: new Set(), services: new Set(), first: ts, last: ts };
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

    const intel = await readIntel(Array.from(map.keys()));
    let enrichedCount = 0;

    const cves: EnvCve[] = Array.from(map.entries())
      .map(([cve, e]) => {
        const row = intel.get(cve);
        const enriched = !!row && row.status === "ok";
        if (enriched) enrichedCount++;
        const nvdSeverity =
          enriched
            ? ((row!.severity as NvdSeverity | null) ??
              severityFromScore(row!.cvss))
            : null;
        return {
          cve,
          assets: e.ips.size,
          ports: Array.from(e.ports).sort((a, b) => a - b),
          services: Array.from(e.services).sort(),
          firstSeen: e.first == null ? null : new Date(e.first).toISOString(),
          lastSeen: e.last == null ? null : new Date(e.last).toISOString(),
          cvss: enriched ? (row!.cvss ?? null) : null,
          nvdSeverity,
          enriched,
        };
      })
      .sort((a, b) => {
        // Enriched + higher CVSS first, then by asset blast radius.
        const sa = a.cvss ?? -1;
        const sb = b.cvss ?? -1;
        if (sb !== sa) return sb - sa;
        return b.assets - a.assets || a.cve.localeCompare(b.cve);
      });

    return {
      ok: true,
      cves,
      totalCves: cves.length,
      totalAffectedAssets: allIps.size,
      scannedPorts,
      enrichedCount,
    };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR") {
      return {
        ok: false,
        message:
          'ยังไม่พร้อม — รัน DB Init (สร้าง cve_intel + vuln_ids) แล้วกด SCAN/เรดาร์ก่อน',
      };
    }
    return { ok: false, message: "โหลดข้อมูล Threat Intel ไม่สำเร็จ" };
  }
}

/**
 * Enrich up to `max` CVEs from NVD that are missing or stale in the cache.
 * Throttled to respect NVD rate limits; persists results to cve_intel so the
 * cost is paid only once per CVE.
 */
export async function enrichCves(
  cveIds: string[],
  max = 6,
): Promise<EnrichResult> {
  const clean = Array.from(
    new Set((Array.isArray(cveIds) ? cveIds : []).map((c) => String(c).trim().toUpperCase()).filter(isCve)),
  );
  if (!clean.length) {
    return { requested: 0, fetched: 0, cached: 0, rateLimited: false, message: "ไม่มี CVE ให้ enrich" };
  }

  try {
    const cache = await readIntel(clean);
    const todo = clean.filter((c) => isStale(cache.get(c))).slice(0, Math.max(1, Math.min(max, 20)));

    let fetched = 0;
    let rateLimited = false;
    const spacing = nvdSpacingMs();

    for (let i = 0; i < todo.length; i++) {
      const cve = todo[i];
      const res = await fetchNvd(cve);
      if (res.rateLimited) {
        rateLimited = true;
        break; // stop; next call will resume remaining CVEs
      }
      await upsertIntel(cve, res);
      fetched++;
      if (i < todo.length - 1) await sleep(spacing);
    }

    return {
      requested: clean.length,
      fetched,
      cached: clean.length - todo.length,
      rateLimited,
      message: rateLimited
        ? `ดึง ${fetched} รายการ แล้วชน rate limit ของ NVD — จะดึงต่อรอบถัดไป`
        : `enrich สำเร็จ ${fetched} รายการ (cache อยู่แล้ว ${clean.length - todo.length})`,
    };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "ER_NO_SUCH_TABLE") {
      return { requested: clean.length, fetched: 0, cached: 0, rateLimited: false, message: "ยังไม่มีตาราง cve_intel — รัน DB Init" };
    }
    return { requested: clean.length, fetched: 0, cached: 0, rateLimited: false, message: "enrich ล้มเหลว" };
  }
}

/** Detail for one CVE — cache-first, then NVD (and caches the result). */
export async function getCveDetail(cveId: string): Promise<CveDetail> {
  const cve = (cveId || "").trim().toUpperCase();
  if (!isCve(cve)) return { ok: false, cve, message: "รูปแบบ CVE-ID ไม่ถูกต้อง" };

  try {
    const cache = await readIntel([cve]);
    const row = cache.get(cve);
    if (row && row.status === "ok" && !isStale(row)) {
      return {
        ok: true,
        cve,
        cvss: row.cvss,
        severity: row.severity,
        vector: row.vector,
        published: row.published,
        description: row.description ?? "ไม่มีคำอธิบาย",
        source: "cache",
      };
    }
  } catch {
    /* cache miss / table missing — fall through to live fetch */
  }

  const res = await fetchNvd(cve);
  if (res.rateLimited) {
    return { ok: false, cve, message: "ชน rate limit ของ NVD — ลองใหม่อีกครั้ง" };
  }
  try {
    await upsertIntel(cve, res);
  } catch {
    /* table may not exist yet; detail still returns below */
  }
  if (res.status === "notfound") {
    return { ok: false, cve, message: "NVD ไม่มีข้อมูลสำหรับ CVE นี้ (อาจยังไม่เผยแพร่)" };
  }
  if (res.status === "error") {
    return { ok: false, cve, message: "เชื่อมต่อ NVD ไม่สำเร็จ — ลองใหม่อีกครั้ง" };
  }
  return {
    ok: true,
    cve,
    cvss: res.cvss,
    severity: res.severity,
    vector: res.vector,
    published: res.published,
    description: res.description ?? "ไม่มีคำอธิบาย",
    source: "nvd",
  };
}

/**
 * Next batch of IPs for the auto radar to sweep. Prioritises IPs never pulled
 * into saved_ports, then the ones scanned longest ago.
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
    return { ok: true, ips: rows.map((r) => String(r.ip)), remaining: Number(cnt?.n ?? 0) };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "ER_NO_SUCH_TABLE") return { ok: false, message: "ยังไม่มีตาราง saved_ips" };
    return { ok: false, message: "ดึงเป้าหมายสำหรับเรดาร์ไม่สำเร็จ" };
  }
}
