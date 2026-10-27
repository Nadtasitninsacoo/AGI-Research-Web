"use server";

import { revalidatePath } from "next/cache";
import type { ResultSetHeader } from "mysql2";
import { db } from "@/lib/db";
import { buildWhere } from "./query";

export type IntelResult = { ok: boolean; message: string; affected?: number };

/** Delete one saved IP by id. */
export async function deleteSavedIp(id: number): Promise<IntelResult> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "id ไม่ถูกต้อง" };
  try {
    const [r] = await db.query<ResultSetHeader>("DELETE FROM saved_ips WHERE id = ?", [id]);
    revalidatePath("/ip-intel");
    return { ok: true, message: `ลบแล้ว`, affected: r.affectedRows };
  } catch {
    return { ok: false, message: "ลบไม่สำเร็จ" };
  }
}

/** Delete every row matching the current filter (or all, when no filter). */
export async function clearSavedIps(q?: string, country?: string): Promise<IntelResult> {
  const { where, args } = buildWhere(q, country);
  try {
    const [r] = await db.query<ResultSetHeader>(`DELETE FROM saved_ips ${where}`, args);
    revalidatePath("/ip-intel");
    return { ok: true, message: `ลบ ${r.affectedRows} รายการ`, affected: r.affectedRows };
  } catch {
    return { ok: false, message: "ลบไม่สำเร็จ" };
  }
}
