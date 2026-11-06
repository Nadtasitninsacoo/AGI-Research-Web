"use server";

import { revalidatePath } from "next/cache";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
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

/** Delete a set of rows by id (multi-select). */
export async function deleteSavedIps(ids: number[]): Promise<IntelResult> {
  const clean = Array.from(new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))).slice(0, 5000);
  if (!clean.length) return { ok: false, message: "ไม่ได้เลือกรายการ" };
  try {
    const [r] = await db.query<ResultSetHeader>("DELETE FROM saved_ips WHERE id IN (?)", [clean]);
    revalidatePath("/ip-intel");
    return { ok: true, message: `ลบ ${r.affectedRows} รายการ`, affected: r.affectedRows };
  } catch {
    return { ok: false, message: "ลบไม่สำเร็จ" };
  }
}

/** Match rows by a place name across country / region / city (contains). */
function placeWhere(name: string): { where: string; args: string[] } | null {
  const s = (name ?? "").trim();
  if (s.length < 1) return null;
  const like = `%${s}%`;
  return { where: "WHERE (country LIKE ? OR region LIKE ? OR city LIKE ?)", args: [like, like, like] };
}

/** How many rows match a place name (preview before a bulk delete). */
export async function countPlace(name: string): Promise<{ ok: boolean; count: number; message?: string }> {
  const p = placeWhere(name);
  if (!p) return { ok: false, count: 0, message: "พิมพ์ชื่อเมือง/จังหวัด/ประเทศ" };
  try {
    const [r] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM saved_ips ${p.where}`, p.args);
    return { ok: true, count: Number(r[0]?.n ?? 0) };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "ER_NO_SUCH_TABLE") return { ok: false, count: 0, message: "ยังไม่มีตาราง saved_ips" };
    return { ok: false, count: 0, message: "ตรวจไม่สำเร็จ" };
  }
}

/** Delete every IP whose country / region / city contains the given name. */
export async function deleteByPlace(name: string): Promise<IntelResult> {
  const p = placeWhere(name);
  if (!p) return { ok: false, message: "พิมพ์ชื่อเมือง/จังหวัด/ประเทศ" };
  try {
    const [r] = await db.query<ResultSetHeader>(`DELETE FROM saved_ips ${p.where}`, p.args);
    revalidatePath("/ip-intel");
    return { ok: true, message: `ลบ ${r.affectedRows} รายการของ "${name.trim()}"`, affected: r.affectedRows };
  } catch {
    return { ok: false, message: "ลบไม่สำเร็จ" };
  }
}
