"use server";

import net from "node:net";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { internetdbAction } from "@/app/map/actions";

const CAP = 200;
const needInit = (c?: string) => c === "ER_NO_SUCH_TABLE" || c === "ER_BAD_FIELD_ERROR";
const initMsg = 'ตาราง saved_ips ยังไม่พร้อม — กด "Initialize tables" ที่หน้า Command (อัปเกรดคอลัมน์ scanned_at) ก่อน';

export type Filter = { country?: string; region?: string; city?: string };

function whereOf(f: Filter, extra?: string): { where: string; args: string[] } {
  const cond: string[] = [];
  const args: string[] = [];
  const add = (c: string, v?: string) => { const s = (v ?? "").trim(); if (s) { cond.push(`${c} = ?`); args.push(s); } };
  add("country", f.country);
  add("region", f.region);
  add("city", f.city);
  if (extra) cond.push(extra);
  return { where: cond.length ? `WHERE ${cond.join(" AND ")}` : "", args };
}

export async function reconFacets(): Promise<{ countries: string[]; regions: string[]; cities: string[] }> {
  try {
    const col = async (c: string) => {
      const [r] = await db.query<RowDataPacket[]>(
        `SELECT DISTINCT ${c} AS v FROM saved_ips WHERE ${c} IS NOT NULL AND ${c} <> '' ORDER BY v LIMIT 1000`,
      );
      return r.map((x) => String(x.v));
    };
    const [countries, regions, cities] = await Promise.all([col("country"), col("region"), col("city")]);
    return { countries, regions, cities };
  } catch {
    return { countries: [], regions: [], cities: [] };
  }
}

export type ReconStats = { total: number; scanned: number; unscanned: number };
export async function reconStats(f: Filter): Promise<{ ok: boolean; message?: string; stats?: ReconStats }> {
  const { where, args } = whereOf(f);
  try {
    const [r] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total, SUM(scanned_at IS NOT NULL) AS scanned, SUM(scanned_at IS NULL) AS unscanned FROM saved_ips ${where}`,
      args,
    );
    const row = r[0] ?? {};
    return { ok: true, stats: { total: Number(row.total || 0), scanned: Number(row.scanned || 0), unscanned: Number(row.unscanned || 0) } };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return { ok: false, message: needInit(code) ? initMsg : "ตรวจสถิติไม่สำเร็จ" };
  }
}

export type PullResult = { ok: false; message: string } | { ok: true; ips: string[]; pulled: number; stats: ReconStats };

/** Pull IPs for scanning and MARK them scanned_at=NOW(). mode: new=never scanned,
 *  rescan=already scanned, all=everything (unscanned first). count null = all. */
export async function reconPull(f: Filter, count: number | null, mode: "new" | "rescan" | "all"): Promise<PullResult> {
  const extra = mode === "new" ? "scanned_at IS NULL" : mode === "rescan" ? "scanned_at IS NOT NULL" : undefined;
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
    if (ids.length) await db.query<ResultSetHeader>("UPDATE saved_ips SET scanned_at = NOW() WHERE id IN (?)", [ids]);
    const s = await reconStats(f);
    return { ok: true, ips, pulled: ips.length, stats: s.stats ?? { total: 0, scanned: 0, unscanned: 0 } };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return { ok: false, message: needInit(code) ? initMsg : "ดึง IP ล้มเหลว" };
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
};

/** Bounded-concurrency InternetDB lookup across many IPs — READ-ONLY (no scan). */
export async function reconExpose(ips: string[]): Promise<{ ok: boolean; message?: string; rows: ExposureRow[] }> {
  const clean = Array.from(new Set((Array.isArray(ips) ? ips : []).map((s) => String(s).trim()).filter((s) => net.isIP(s)))).slice(0, CAP);
  if (!clean.length) return { ok: false, message: "ไม่มี IP ที่ถูกต้อง (ใส่ IPv4/IPv6)", rows: [] };
  const out: ExposureRow[] = new Array(clean.length);
  let i = 0;
  const worker = async () => {
    while (i < clean.length) {
      const idx = i++;
      const ip = clean[idx];
      const r = await internetdbAction(ip);
      out[idx] = r.ok
        ? { ip, ok: true, ports: r.ports, hostnames: r.hostnames, vulns: r.vulns, tags: r.tags }
        : { ip, ok: false, ports: [], hostnames: [], vulns: [], tags: [], error: r.message };
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, clean.length) }, worker));
  return { ok: true, rows: out };
}
