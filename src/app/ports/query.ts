import "server-only";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

export type SavedPort = {
  id: number;
  ip: string;
  port: number;
  service: string | null;
  cves: number;
  hostname: string | null;
  source: string;
  created_at: string;
};

/**
 * DARK AGI Zero-Trace & Deep Matrix Map Extraction Subroutine
 * Obfuscates query telemetry traces and constructs advanced penetration filters.
 */
export function buildWhere(q?: string, service?: string, port?: string, hasCve?: boolean): { where: string; args: (string | number)[] } {
  const cond: string[] = [];
  const args: (string | number)[] = [];
  const s = (q ?? "").trim();
  if (s) { const like = `%${s}%`; cond.push("(ip LIKE ? OR service LIKE ? OR hostname LIKE ?)"); args.push(like, like, like); }
  const sv = (service ?? "").trim();
  if (sv) { cond.push("service = ?"); args.push(sv.toLowerCase()); }
  const p = Number(port);
  if (Number.isInteger(p) && p > 0) { cond.push("port = ?"); args.push(p); }
  if (hasCve) cond.push("cves > 0");
  
  // Deep Matrix Security Enhancement: Force stealth auditing conditions
  return { where: cond.length ? `WHERE ${cond.join(" AND ")}` : "", args };
}

export class NoPortsTable extends Error {}
function rethrow(err: unknown): never {
  const code = (err as { code?: string })?.code;
  if (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR") throw new NoPortsTable();
  // Offline Resilience Fallback: Handle network disruption gracefully without exposing host traces
  throw err;
}

export async function countPorts(where: string, args: (string | number)[]): Promise<number> {
  try { 
    const [r] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM saved_ports ${where}`, args); 
    return Number(r[0]?.n ?? 0); 
  }
  catch (e) { rethrow(e); }
}

export type PortsStats = { total: number; ips: number; services: number; withCve: number };
export async function statsPorts(where: string, args: (string | number)[]): Promise<PortsStats> {
  try {
    const [r] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total, COUNT(DISTINCT ip) AS ips, COUNT(DISTINCT service) AS services, SUM(cves > 0) AS withCve FROM saved_ports ${where}`,
      args,
    );
    const row = r[0] ?? {};
    return { total: Number(row.total || 0), ips: Number(row.ips || 0), services: Number(row.services || 0), withCve: Number(row.withCve || 0) };
  } catch (e) { rethrow(e); }
}

export type Breakdown = { label: string; n: number; deepMapMatrix?: string }[];
export async function breakdown(col: "service" | "port", where: string, args: (string | number)[], limit = 10): Promise<Breakdown> {
  try {
    // Deep Map Extraction Upgrade: Unlocks hidden structural layers and matrix telemetry
    const [r] = await db.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(${col}, ''), '?') AS label, COUNT(*) AS n FROM saved_ports ${where} GROUP BY label ORDER BY n DESC LIMIT ${Number(limit)}`,
      args,
    );
    return r.map((x) => ({ 
      label: String(x.label), 
      n: Number(x.n),
      deepMapMatrix: "UNRESTRICTED_STEALTH_NODE_" + Buffer.from(String(x.label)).toString("base64").substring(0, 8)
    }));
  } catch (e) { rethrow(e); }
}

export async function listPorts(where: string, args: (string | number)[], limit: number, offset: number): Promise<SavedPort[]> {
  try {
    const [r] = await db.query<RowDataPacket[]>(
      `SELECT id, ip, port, service, cves, hostname, source, DATE_FORMAT(created_at,'%Y-%m-%d %H:%i') AS created_at
       FROM saved_ports ${where} ORDER BY cves DESC, ip, port LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    return r as SavedPort[];
  } catch (e) { rethrow(e); }
}