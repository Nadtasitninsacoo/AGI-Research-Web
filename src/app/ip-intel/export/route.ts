import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { buildWhere } from "../query";

const esc = (v: unknown) => (v == null ? "" : `"${String(v).replace(/"/g, '""')}"`);

/** Stream the saved IPs matching the current filter as a CSV download. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const { where, args } = buildWhere(u.searchParams.get("q") ?? "", u.searchParams.get("country") ?? "");
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT ip, city, region, country, lat, lon, source, note,
              DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') AS created_at
       FROM saved_ips ${where} ORDER BY created_at DESC, id DESC LIMIT 100000`,
      args,
    );
    const header = "ip,city,region,country,lat,lon,source,note,created_at";
    const body = rows
      .map((r) => [r.ip, r.city, r.region, r.country, r.lat, r.lon, r.source, r.note, r.created_at].map(esc).join(","))
      .join("\n");
    return new Response(`${header}\n${body}\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="saved_ips_${Date.now()}.csv"`,
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const needInit = code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR";
    return new Response(needInit ? "saved_ips not ready — run Initialize tables" : "export failed", { status: needInit ? 404 : 500 });
  }
}
