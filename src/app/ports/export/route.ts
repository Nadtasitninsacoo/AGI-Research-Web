import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { buildWhere } from "../query";

const esc = (v: unknown) => (v == null ? "" : `"${String(v).replace(/"/g, '""')}"`);

export async function GET(req: Request) {
  const u = new URL(req.url);
  const { where, args } = buildWhere(
    u.searchParams.get("q") ?? "", u.searchParams.get("service") ?? "",
    u.searchParams.get("port") ?? "", u.searchParams.get("cve") === "1",
  );
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT ip, port, service, cves, hostname, source, DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') AS created_at
       FROM saved_ports ${where} ORDER BY ip, port LIMIT 200000`,
      args,
    );
    const header = "ip,port,service,cves,hostname,source,created_at";
    const body = rows.map((r) => [r.ip, r.port, r.service, r.cves, r.hostname, r.source, r.created_at].map(esc).join(",")).join("\n");
    return new Response(`${header}\n${body}\n`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="saved_ports_${Date.now()}.csv"` },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const need = code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR";
    return new Response(need ? "saved_ports not ready — run Initialize tables" : "export failed", { status: need ? 404 : 500 });
  }
}
