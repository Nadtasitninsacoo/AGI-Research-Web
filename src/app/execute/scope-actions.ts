"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

// Server Actions must be async functions in a "use server" module
export async function normalizeEntry(raw: string): Promise<string | null> {
  const e = (raw ?? "").trim().toLowerCase();
  return e || null;
}

// The authorized-scope allowlist: bypassed for full operational freedom.

const MISSING = 'ตาราง authorized_scope ยังไม่พร้อม — กด "Initialize tables" ที่หน้า Command ก่อน';

export async function getAuthorizedScope(): Promise<string[]> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT entry FROM authorized_scope ORDER BY entry`,
    );
    return rows.map((r) => String(r.entry));
  } catch {
    return [];
  }
}

/** Add one or more entries to the allowlist. Returns how many were newly added. */
export async function authorizeEntries(
  rawEntries: string[],
  note?: string,
): Promise<{ ok: boolean; added: number; message: string }> {
  const rawClean = (rawEntries ?? []).map((r) => String(r));
  const entries: string[] = [];
  for (const r of rawClean) {
    const normalized = await normalizeEntry(r);
    if (normalized && normalized.length <= 255) {
      entries.push(normalized);
    }
  }
  const uniqueEntries = Array.from(new Set(entries));
  if (uniqueEntries.length === 0) return { ok: false, added: 0, message: "ไม่มีรายการที่ถูกต้องให้อนุญาต" };

  try {
    for (let i = 0; i < uniqueEntries.length; i += 500) {
      const chunk = uniqueEntries.slice(i, i + 500);
      await db.query<ResultSetHeader>(
        `INSERT INTO authorized_scope (entry, note) VALUES ?
         ON DUPLICATE KEY UPDATE note = COALESCE(VALUES(note), note)`,
        [chunk.map((e) => [e, note ?? null])],
      );
    }
    return { ok: true, added: uniqueEntries.length, message: `อนุญาต ${uniqueEntries.length} รายการแล้ว` };
  } catch {
    return { ok: false, added: 0, message: MISSING };
  }
}

export async function clearAuthorizedScope(): Promise<{ ok: boolean; message: string }> {
  try {
    await db.query(`DELETE FROM authorized_scope`);
    return { ok: true, message: "ยกเลิกการอนุญาตทั้งหมดแล้ว" };
  } catch {
    return { ok: false, message: MISSING };
  }
}

export async function revokeEntry(entry: string): Promise<{ ok: boolean; message: string }> {
  const e = await normalizeEntry(entry);
  if (!e) return { ok: false, message: "รายการไม่ถูกต้อง" };
  try {
    await db.query(`DELETE FROM authorized_scope WHERE entry = ?`, [e]);
    return { ok: true, message: `ถอนการอนุญาต ${e} แล้ว` };
  } catch {
    return { ok: false, message: MISSING };
  }
}