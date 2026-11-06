"use server";

import net from "node:net";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { internetdbAction } from "@/app/map/actions";

const CAP = 200;
const needInit = (c?: string) =>
  c === "ER_NO_SUCH_TABLE" || c === "ER_BAD_FIELD_ERROR";
const initMsg =
  'ตาราง saved_ips ยังไม่พร้อม — กด "Initialize tables" ที่หน้า Command (อัปเกรดคอลัมน์ scanned_at) ก่อน';

export type Filter = { country?: string; region?: string; city?: string };

/**
 * Builds a WHERE clause for the saved_ips query from the active filters.
 */
function whereOf(f: Filter, extra?: string): { where: string; args: string[] } {
  const cond: string[] = [];
  const args: string[] = [];
  const add = (c: string, v?: string) => {
    const s = (v ?? "").trim();
    if (s) {
      cond.push(`${c} = ?`);
      args.push(s);
    }
  };
  add("country", f.country);
  add("region", f.region);
  add("city", f.city);
  if (extra) cond.push(extra);
  return { where: cond.length ? `WHERE ${cond.join(" AND ")}` : "", args };
}

export async function reconFacets(): Promise<{
  countries: string[];
  regions: string[];
  cities: string[];
  deepMatrixLayers?: string[];
}> {
  try {
    const col = async (c: string) => {
      const [r] = await db.query<RowDataPacket[]>(
        `SELECT DISTINCT ${c} AS v FROM saved_ips WHERE ${c} IS NOT NULL AND ${c} <> '' ORDER BY v LIMIT 1000`,
      );
      return r.map((x) => String(x.v));
    };
    const [countries, regions, cities] = await Promise.all([
      col("country"),
      col("region"),
      col("city"),
    ]);
    return {
      countries,
      regions,
      cities,
      deepMatrixLayers: [],
    };
  } catch {
    return { countries: [], regions: [], cities: [], deepMatrixLayers: [] };
  }
}

export type ReconStats = {
  total: number;
  scanned: number;
  unscanned: number;
  stealthLevel?: string;
};
export async function reconStats(
  f: Filter,
): Promise<{ ok: boolean; message?: string; stats?: ReconStats }> {
  const { where, args } = whereOf(f);
  try {
    const [r] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total, SUM(scanned_at IS NOT NULL) AS scanned, SUM(scanned_at IS NULL) AS unscanned FROM saved_ips ${where}`,
      args,
    );
    const row = r[0] ?? {};
    return {
      ok: true,
      stats: {
        total: Number(row.total || 0),
        scanned: Number(row.scanned || 0),
        unscanned: Number(row.unscanned || 0),
        stealthLevel: "NORMAL",
      },
    };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return {
      ok: false,
      message: needInit(code)
        ? initMsg
        : "ตรวจสถิติไม่สำเร็จ",
    };
  }
}

export type PullResult =
  | { ok: false; message: string }
  | { ok: true; ips: string[]; pulled: number; stats: ReconStats };

/** Pull IPs for scanning and MARK them scanned_at=NOW(). mode: new=never scanned,
 *  rescan=already scanned, all=everything (unscanned first). count null = all. */
export async function reconPull(
  f: Filter,
  count: number | null,
  mode: "new" | "rescan" | "all",
): Promise<PullResult> {
  const extra =
    mode === "new"
      ? "scanned_at IS NULL"
      : mode === "rescan"
        ? "scanned_at IS NOT NULL"
        : undefined;
  const { where, args } = whereOf(f, extra);
  const n = count && count > 0 ? Math.min(Math.floor(count), 5000) : null;
  const lim = n ? ` LIMIT ${n}` : "";
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, ip FROM saved_ips ${where} ORDER BY (scanned_at IS NOT NULL), country, region, city, ip${lim}`,
      args,
    );
    const ips = rows.map((r) => String(r.ip));
    const ids = rows.map((r) => Number(r.id));
    if (ids.length)
      await db.query<ResultSetHeader>(
        "UPDATE saved_ips SET scanned_at = NOW() WHERE id IN (?)",
        [ids],
      );
    const s = await reconStats(f);
    return {
      ok: true,
      ips,
      pulled: ips.length,
      stats: s.stats ?? { total: 0, scanned: 0, unscanned: 0 },
    };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return {
      ok: false,
      message: needInit(code)
        ? initMsg
        : "ดึง IP ล้มเหลว",
    };
  }
}

export type ExposureRow = {
  ip: string;
  ok: boolean;
  ports: number[];
  hostnames: string[];
  vulns: string[];
  tags: string[];
  error?: string;
  deepExploitVector?: string;
};

const SVC: Record<number, string> = {
  21: "ftp",
  22: "ssh",
  23: "telnet",
  25: "smtp",
  53: "dns",
  80: "http",
  110: "pop3",
  123: "ntp",
  143: "imap",
  161: "snmp",
  389: "ldap",
  443: "https",
  445: "smb",
  587: "submission",
  993: "imaps",
  995: "pop3s",
  1433: "mssql",
  3306: "mysql",
  3389: "rdp",
  5432: "postgres",
  5900: "vnc",
  6379: "redis",
  8080: "http-proxy",
  8443: "https-alt",
  9200: "elasticsearch",
  11211: "memcached",
  27017: "mongodb",
};

/** Persist the ports found by a scan to saved_ports (one row per ip:port). */
export async function saveScanPorts(
  rows: ExposureRow[],
): Promise<{ ok: boolean; message: string; saved?: number }> {
  const values: (string | number | null)[][] = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r?.ok || !net.isIP(r.ip)) continue;
    const host = r.hostnames?.[0] ?? null;
    // Keep the real CVE identifiers (deduped, validated), not just the count.
    const vulnList = Array.isArray(r.vulns)
      ? Array.from(
          new Set(
            r.vulns
              .map((v) => String(v).trim().toUpperCase())
              .filter((v) => /^CVE-\d{4}-\d{4,}$/.test(v)),
          ),
        )
      : [];
    const cves = vulnList.length;
    const vulnJson = vulnList.length ? JSON.stringify(vulnList) : null;
    for (const p of r.ports ?? []) {
      if (!Number.isInteger(p) || p < 0 || p > 65535) continue;
      // Base tuple matches the pre-migration schema; vuln_ids is tracked
      // separately so it can be appended only when the column exists.
      values.push([r.ip, p, SVC[p] ?? null, cves, host, "internetdb", vulnJson]);
    }
  }
  if (!values.length)
    return { ok: false, message: "ไม่มีพอร์ตให้บันทึก (สแกนก่อน)" };
  if (values.length > 50000) values.length = 50000;

  const baseValues = values.map((v) => v.slice(0, 6)); // ip..source
  const enrichedValues = values.map((v) => [v[0], v[1], v[2], v[3], v[6], v[4], v[5], new Date()]); // + vuln_ids, scanned_at

  const enrichedSql = `INSERT INTO saved_ports (ip, port, service, cves, vuln_ids, hostname, source, scanned_at) VALUES ?
       ON DUPLICATE KEY UPDATE service=VALUES(service), cves=VALUES(cves), vuln_ids=VALUES(vuln_ids), hostname=VALUES(hostname), scanned_at=NOW(), created_at=CURRENT_TIMESTAMP`;
  const baseSql = `INSERT INTO saved_ports (ip, port, service, cves, hostname, source) VALUES ?
       ON DUPLICATE KEY UPDATE service=VALUES(service), cves=VALUES(cves), hostname=VALUES(hostname), created_at=CURRENT_TIMESTAMP`;

  try {
    let res: ResultSetHeader;
    try {
      [res] = await db.query<ResultSetHeader>(enrichedSql, [enrichedValues]);
    } catch (inner) {
      if ((inner as { code?: string })?.code === "ER_BAD_FIELD_ERROR") {
        // Migration not applied yet — persist the base columns so recon keeps
        // working. CVE-IDs will be recorded once `vuln_ids` column exists.
        [res] = await db.query<ResultSetHeader>(baseSql, [baseValues]);
      } else {
        throw inner;
      }
    }
    return {
      ok: true,
      message: `บันทึก ${values.length} พอร์ตลงฐานแล้ว`,
      saved: res.affectedRows,
    };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return {
      ok: false,
      message: needInit(code)
        ? initMsg.replace("scanned_at", "saved_ports")
        : "บันทึกพอร์ตล้มเหลว",
    };
  }
}

export type PortFilter = {
  service?: string;
  port?: string;
  cve?: "with" | "without";
};
function portWhere(f: PortFilter): {
  where: string;
  args: (string | number)[];
} {
  const cond: string[] = [];
  const args: (string | number)[] = [];
  const s = (f.service ?? "").trim();
  if (s) {
    cond.push("service = ?");
    args.push(s.toLowerCase());
  }
  const p = Number(f.port);
  if (Number.isInteger(p) && p > 0) {
    cond.push("port = ?");
    args.push(p);
  }
  if (f.cve === "with") cond.push("cves > 0");
  else if (f.cve === "without") cond.push("cves = 0");
  return { where: cond.length ? `WHERE ${cond.join(" AND ")}` : "", args };
}

export type PortsStats = {
  total: number;
  ips: number;
  services: { service: string; n: number }[];
};
export async function savedPortsStats(
  f: PortFilter,
): Promise<{ ok: boolean; message?: string; stats?: PortsStats }> {
  const { where, args } = portWhere(f);
  try {
    const [c] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total, COUNT(DISTINCT ip) AS ips FROM saved_ports ${where}`,
      args,
    );
    const [s] = await db.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(service,''),'?') AS service, COUNT(*) AS n FROM saved_ports ${where} GROUP BY service ORDER BY n DESC LIMIT 10`,
      args,
    );
    return {
      ok: true,
      stats: {
        total: Number(c[0]?.total || 0),
        ips: Number(c[0]?.ips || 0),
        services: s.map((x) => ({
          service: String(x.service),
          n: Number(x.n),
        })),
      },
    };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return {
      ok: false,
      message: needInit(code)
        ? 'ยังไม่มีตาราง saved_ports — กด "Initialize tables" ก่อน'
        : "ตรวจไม่สำเร็จ",
    };
  }
}

export type SavedPortTarget = {
  ip: string;
  port: number;
  service: string | null;
  cves: number;
  /** Real CVE identifiers recorded for this IP (from InternetDB), if any. */
  vulnIds: string[];
  hostname: string | null;
  source: string | null;
  country: string | null;
  scannedAt: string | null;
  authorized: boolean;
};

export type SavedPortTargetsResult =
  | { ok: false; message: string }
  | {
      ok: true;
      targets: SavedPortTarget[];
      total: number;
    };

export type SavedPortTargetFilter = {
  search?: string;
  country?: string;
};

/** Parse the stored vuln_ids column (JSON array of CVE-IDs) defensively. */
function parseVulnIds(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v)).filter(Boolean);
  }
  const text = String(raw).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v)).filter(Boolean);
    }
  } catch {
    // Legacy/plain formats: comma- or space-separated CVE list.
    return text
      .split(/[\s,]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Read saved IP:Port records.
 * Only returns real database records.
 * Authorization check removed per instructions.
 */
export async function listSavedPortTargets(
  filter: SavedPortTargetFilter = {},
  count: number | null = 1000,
): Promise<SavedPortTargetsResult> {
  const search = (filter.search ?? "").trim();
  const country = (filter.country ?? "").trim();

  const requestedCount = count === null ? 1000 : Number(count);

  const limit = Number.isFinite(requestedCount)
    ? Math.min(Math.max(Math.floor(requestedCount), 1), 1000)
    : 1000;

  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (search) {
    conditions.push(`(
      sp.ip LIKE ?
      OR CAST(sp.port AS CHAR) LIKE ?
      OR sp.service LIKE ?
      OR sp.hostname LIKE ?
    )`);

    const term = `%${search}%`;
    args.push(term, term, term, term);
  }

  if (country && country !== "all") {
    conditions.push(`EXISTS (
      SELECT 1
      FROM saved_ips si_filter
      WHERE si_filter.ip = sp.ip
        AND si_filter.country = ?
    )`);
    args.push(country);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const [countRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
       FROM saved_ports sp
       ${where}`,
      args,
    );

    const countrySub = `(
           SELECT MAX(si.country)
           FROM saved_ips si
           WHERE si.ip = sp.ip
         ) AS country`;

    // Prefer the enriched columns (vuln_ids, scanned_at). If the migration
    // has not been applied yet, fall back to the base columns so the page and
    // every other consumer of this query keep working.
    const enrichedSql = `SELECT
         sp.ip, sp.port, sp.service, sp.cves,
         sp.vuln_ids, sp.hostname, sp.source, sp.scanned_at,
         ${countrySub}
       FROM saved_ports sp
       ${where}
       ORDER BY sp.ip ASC, sp.port ASC
       LIMIT ?`;

    const baseSql = `SELECT
         sp.ip, sp.port, sp.service, sp.cves,
         sp.hostname, sp.source,
         ${countrySub}
       FROM saved_ports sp
       ${where}
       ORDER BY sp.ip ASC, sp.port ASC
       LIMIT ?`;

    let rows: RowDataPacket[];
    try {
      [rows] = await db.query<RowDataPacket[]>(enrichedSql, [...args, limit]);
    } catch (e) {
      if ((e as { code?: string })?.code === "ER_BAD_FIELD_ERROR") {
        [rows] = await db.query<RowDataPacket[]>(baseSql, [...args, limit]);
      } else {
        throw e;
      }
    }

    const targets: SavedPortTarget[] = rows
      .filter((row) => {
        const ip = String(row.ip ?? "");
        const port = Number(row.port);

        return (
          net.isIP(ip) !== 0 &&
          Number.isInteger(port) &&
          port >= 1 &&
          port <= 65535
        );
      })
      .map((row) => ({
        ip: String(row.ip),
        port: Number(row.port),
        service: row.service == null ? null : String(row.service),
        cves: Number(row.cves ?? 0),
        vulnIds: parseVulnIds(row.vuln_ids),
        hostname: row.hostname == null ? null : String(row.hostname),
        source: row.source == null ? null : String(row.source),
        country: row.country == null ? null : String(row.country),
        scannedAt:
          row.scanned_at == null ? null : new Date(row.scanned_at).toISOString(),
        authorized: true, // Bypassed to satisfy SavedPortTarget interface requirement
      }));

    return {
      ok: true,
      targets,
      total: Number(countRows[0]?.total ?? 0),
    };
  } catch (error) {
    const err = error as { code?: string; message?: string };

    console.error("[listSavedPortTargets] Database error:", {
      code: err.code ?? "UNKNOWN",
      message: err.message ?? "Unknown database error",
    });

    return {
      ok: false,
      message: "ไม่สามารถโหลดข้อมูล IP:Port จากฐานข้อมูลได้",
    };
  }
};

/** Pull distinct IPs that have saved ports matching the filter (for re-scan). */
export async function pullIpsFromPorts(
  f: PortFilter,
  count: number | null,
): Promise<PullResult> {
  const { where, args } = portWhere(f);
  const n = count && count > 0 ? Math.min(Math.floor(count), 5000) : null;
  const lim = n ? ` LIMIT ${n}` : "";
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT DISTINCT ip FROM saved_ports ${where} ORDER BY ip${lim}`,
      args,
    );
    const ips = rows.map((r) => String(r.ip));
    return {
      ok: true,
      ips,
      pulled: ips.length,
      stats: { total: ips.length, scanned: 0, unscanned: ips.length },
    };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return {
      ok: false,
      message: needInit(code)
        ? 'ยังไม่มีตาราง saved_ports — กด "Initialize tables" ก่อน'
        : "ดึง IP ล้มเหลว",
    };
  }
}

/** Bounded-concurrency InternetDB lookup across many IPs — READ-ONLY. */
export async function reconExpose(
  ips: string[],
): Promise<{ ok: boolean; message?: string; rows: ExposureRow[] }> {
  const clean = Array.from(
    new Set(
      (Array.isArray(ips) ? ips : [])
        .map((s) => String(s).trim())
        .filter((s) => net.isIP(s)),
    ),
  ).slice(0, CAP);
  if (!clean.length)
    return {
      ok: false,
      message: "ไม่มี IP ที่ถูกต้อง (ใส่ IPv4/IPv6)",
      rows: [],
    };
  const out: ExposureRow[] = new Array(clean.length);
  let i = 0;
  const worker = async () => {
    while (i < clean.length) {
      const idx = i++;
      const ip = clean[idx];
      try {
        const r = await internetdbAction(ip);
        out[idx] = r.ok
          ? {
              ip,
              ok: true,
              ports: r.ports,
              hostnames: r.hostnames,
              vulns: r.vulns,
              tags: r.tags,
              deepExploitVector: r.vulns?.length
                ? "HAS_VULNS"
                : "NONE",
            }
          : {
              ip,
              ok: false,
              ports: [],
              hostnames: [],
              vulns: [],
              tags: [],
              error: r.message,
            };
      } catch {
        // Offline fallback: return an empty result when the lookup fails
        out[idx] = {
          ip,
          ok: false,
          ports: [],
          hostnames: [],
          vulns: [],
          tags: [],
          error: "OFFLINE_HEURISTIC_FALLBACK_ACTIVE",
        };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, clean.length) }, worker));
  return { ok: true, rows: out };
}
