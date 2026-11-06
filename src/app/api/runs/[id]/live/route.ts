import { connection } from "next/server";
import { getRunSnapshot } from "@/lib/runs";

export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]/live">) {
  await connection();
  const { id: raw } = await ctx.params;
  if (!/^\d{1,9}$/.test(raw) || Number(raw) < 1) {
    return Response.json({ message: "Invalid run." }, { status: 400 });
  }

  const res = await getRunSnapshot(Number(raw));
  if (!res.ok) {
    const status = res.status === 404 ? 404 : 502;
    return Response.json({ message: res.message }, { status, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(res.data, { headers: { "Cache-Control": "no-store" } });
}
