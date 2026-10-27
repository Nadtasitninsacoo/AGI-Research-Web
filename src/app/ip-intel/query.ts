import "server-only";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

export type SavedIp = {
  id: number;
  ip: string;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
  source: string;
  note: string | null;
  created_at: string;
};

/** Build a WHERE clause from the free-text query + exact country filter. */
export function buildWhere(q?: string, country?: string): { where: string; args: string[] } {
  const cond: string[] = [];
  const args: string[] = [];
  const s = (q ?? "").trim();
  if (s) {
    const like = `%${s}%`;
    cond.push("(ip LIKE ? OR city LIKE ? OR region LIKE ? OR country LIKE ? OR note LIKE ?)");
    args.push(like, like, like, like, like);
  }
  const c = (country ?? "").trim();
  if (c) {
    cond.push("country = ?");
    args.push(c);
  }
  return { where: cond.length ? `WHERE ${cond.join(" AND ")}` : "", args };
}

/** Raised when saved_ips is missing or out of date (needs Initialize tables). */
export class NoSavedIpsTable extends Error {
  constructor(public reason: "missing" | "outdated") { super(reason); }
}

function rethrow(err: unknown): never {
  const code = (err as { code?: string })?.code;
  if (code === "ER_NO_SUCH_TABLE") throw new NoSavedIpsTable("missing");
  if (code === "ER_BAD_FIELD_ERROR") throw new NoSavedIpsTable("outdated"); // e.g. no `region` column yet
  throw err;
}

export async function countSavedIps(where: string, args: string[]): Promise<number> {
  try {
    const [r] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM saved_ips ${where}`, args);
    return Number(r[0]?.n ?? 0);
  } catch (e) { rethrow(e); }
}

export type Stats = { total: number; countries: number; regions: number; cities: number; latest: string | null };
export async function statsSavedIps(where: string, args: string[]): Promise<Stats> {
  try {
    const [r] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total, COUNT(DISTINCT country) AS countries, COUNT(DISTINCT region) AS regions,
              COUNT(DISTINCT city) AS cities, DATE_FORMAT(MAX(created_at),'%Y-%m-%d %H:%i') AS latest
       FROM saved_ips ${where}`,
      args,
    );
    const row = r[0] ?? {};
    return {
      total: Number(row.total ?? 0), countries: Number(row.countries ?? 0),
      regions: Number(row.regions ?? 0), cities: Number(row.cities ?? 0),
      latest: row.latest ?? null,
    };
  } catch (e) { rethrow(e); }
}

export type Breakdown = { label: string; n: number }[];
export async function breakdown(col: "country" | "region" | "city", where: string, args: string[], limit = 8): Promise<Breakdown> {
  try {
    const [r] = await db.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(${col}, ''), '—') AS label, COUNT(*) AS n
       FROM saved_ips ${where} GROUP BY label ORDER BY n DESC LIMIT ${Number(limit)}`,
      args,
    );
    return r.map((x) => ({ label: String(x.label), n: Number(x.n) }));
  } catch (e) { rethrow(e); }
}

export async function listSavedIps(where: string, args: string[], limit: number, offset: number): Promise<SavedIp[]> {
  try {
    const [r] = await db.query<RowDataPacket[]>(
      `SELECT id, ip, city, region, country, lat, lon, source, note,
              DATE_FORMAT(created_at,'%Y-%m-%d %H:%i') AS created_at
       FROM saved_ips ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    return r as SavedIp[];
  } catch (e) { rethrow(e); }
}
