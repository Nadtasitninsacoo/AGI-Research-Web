"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { normalizeEntry } from "@/lib/execution/scopeMatch";

// The authorized-scope allowlist: the explicit Rules-of-Engagement the operator
// approves before any real firing. Real runs are gated to these entries (exact
// IP, CIDR, bare domain, or *.wildcard). The table is created by the privileged
// "Initialize tables" step (api/db/init-tables); these actions never create it
// and never throw to the UI — on a missing table they degrade gracefully.

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
  const entries = Array.from(
    new Set((rawEntries ?? []).map(normalizeEntry).filter((e): e is string => !!e && e.length <= 255)),
  );
  if (entries.length === 0) return { ok: false, added: 0, message: "ไม่มีรายการที่ถูกต้องให้อนุญาต" };

  try {
    // Bulk insert in chunks so authorizing many targets at once is one round-trip
    // per chunk, not one query per entry.
    for (let i = 0; i < entries.length; i += 500) {
      const chunk = entries.slice(i, i + 500);
      await db.query<ResultSetHeader>(
        `INSERT INTO authorized_scope (entry, note) VALUES ?
         ON DUPLICATE KEY UPDATE note = COALESCE(VALUES(note), note)`,
        [chunk.map((e) => [e, note ?? null])],
      );
    }
    return { ok: true, added: entries.length, message: `อนุญาต ${entries.length} รายการแล้ว` };
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
  const e = normalizeEntry(entry);
  if (!e) return { ok: false, message: "รายการไม่ถูกต้อง" };
  try {
    await db.query(`DELETE FROM authorized_scope WHERE entry = ?`, [e]);
    return { ok: true, message: `ถอนการอนุญาต ${e} แล้ว` };
  } catch {
    return { ok: false, message: MISSING };
  }
}
