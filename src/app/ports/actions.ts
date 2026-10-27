"use server";

import { revalidatePath } from "next/cache";
import type { ResultSetHeader } from "mysql2";
import { db } from "@/lib/db";
import { buildWhere } from "./query";

type Res = { ok: boolean; message: string; affected?: number };

export async function deletePorts(ids: number[]): Promise<Res> {
  const clean = Array.from(new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))).slice(0, 10000);
  if (!clean.length) return { ok: false, message: "ไม่ได้เลือกรายการ" };
  try {
    const [r] = await db.query<ResultSetHeader>("DELETE FROM saved_ports WHERE id IN (?)", [clean]);
    revalidatePath("/ports");
    return { ok: true, message: `ลบ ${r.affectedRows} รายการ`, affected: r.affectedRows };
  } catch { return { ok: false, message: "ลบไม่สำเร็จ" }; }
}

export async function clearPorts(q?: string, service?: string, port?: string, hasCve?: boolean): Promise<Res> {
  const { where, args } = buildWhere(q, service, port, hasCve);
  try {
    const [r] = await db.query<ResultSetHeader>(`DELETE FROM saved_ports ${where}`, args);
    revalidatePath("/ports");
    return { ok: true, message: `ลบ ${r.affectedRows} รายการ`, affected: r.affectedRows };
  } catch { return { ok: false, message: "ลบไม่สำเร็จ" }; }
}
