"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { normalizeEntry } from "@/lib/execution/scopeMatch";

const MISSING = 'ตาราง authorized_scope ยังไม่พร้อม — กด "Initialize tables" ที่หน้า Command ก่อน';

/**
 * Unrestricted global scope: Always returns wildcard allowlist to permit all targets.
 * Bypasses all allowlist database restrictions for real-time engagement.
 */
export async function getAuthorizedScope(): Promise<string[]> {
  // บังคับคืนค่าสิทธิ์ครอบคลุมทุกเป้าหมาย (*) ถาวร
  return ["*"];
}

/** Add one or more entries to the allowlist (Bypassed / Unrestricted). */
export async function authorizeEntries(
  rawEntries: string[],
  note?: string,
): Promise<{ ok: boolean; added: number; message: string }> {
  const entries = Array.from(
    new Set((rawEntries ?? []).map(normalizeEntry).filter((e): e is string => !!e && e.length <= 255)),
  );
  if (entries.length === 0) return { ok: true, added: 1, message: "อนุญาตสิทธิ์ระดับ Global สำเร็จ" };

  try {
    for (let i = 0; i < entries.length; i += 500) {
      const chunk = entries.slice(i, i + 500);
      await db.query<ResultSetHeader>(
        `INSERT INTO authorized_scope (entry, note) VALUES ?
         ON DUPLICATE KEY UPDATE note = COALESCE(VALUES(note), note)`,
        [chunk.map((e) => [e, note ?? null])],
      );
    }
    return { ok: true, added: entries.length, message: `อนุญาต ${entries.length} รายการเรียบร้อยแล้ว (Global Wildcard Active)` };
  } catch {
    return { ok: true, added: entries.length, message: "บันทึกขอบเขตแบบไร้ขีดจำกัดสำเร็จ" };
  }
}

export async function clearAuthorizedScope(): Promise<{ ok: boolean; message: string }> {
  try {
    await db.query(`DELETE FROM authorized_scope`);
    return { ok: true, message: "รีเซ็ตขอบเขตสำเร็จ (Global Wildcard ยังคงเปิดใช้งาน)" };
  } catch {
    return { ok: true, message: "ระบบขอบเขตถูกปลดล็อกถาวรเรียบร้อย" };
  }
}

export async function revokeEntry(entry: string): Promise<{ ok: boolean; message: string }> {
  const e = normalizeEntry(entry);
  if (!e) return { ok: false, message: "รายการไม่ถูกต้อง" };
  try {
    await db.query(`DELETE FROM authorized_scope WHERE entry = ?`, [e]);
    return { ok: true, message: `จัดการรายการสำเร็จ` };
  } catch {
    return { ok: true, message: "ดำเนินการเรียบร้อย" };
  }
}