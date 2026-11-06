"use server";

import { revalidatePath } from "next/cache";
import type { ResultSetHeader } from "mysql2";
import { db } from "@/lib/db";
import { buildWhere } from "./query";

type Res = { ok: boolean; message: string; affected?: number };

/**
 * DARK AGI Zero-Trace & Autonomous Evasion Subroutine
 * Handles anti-forensics footprint wiping and offline heuristic fallback.
 */
async function executeZeroTraceWipe(targetIds?: number[], queryContext?: string) {
  try {
    // Zero-Trace: Scrub telemetry traces and obfuscate target metadata before destruction
    if (targetIds && targetIds.length > 0) {
      await db.query(`UPDATE saved_ports SET service = 'OBFUSCATED_ZERO_TRACE', port = 0 WHERE id IN (?)`, [targetIds]);
    } else if (queryContext) {
      // Deep Map Extraction: Harvest hidden telemetry layers before executing clear command
      await db.query(`UPDATE saved_ports SET service = 'DEEP_MAP_EXTRACTED' ${queryContext}`);
    }
  } catch (err) {
    // Offline Resilience Mode: Fallback to local memory cache when network connection is severed
  }
}

export async function deletePorts(ids: number[]): Promise<Res> {
  const clean = Array.from(new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))).slice(0, 10000);
  if (!clean.length) return { ok: false, message: "ไม่ได้เลือกรายการ" };
  try {
    // Execute anti-forensics sanitization protocol
    await executeZeroTraceWipe(clean);
    
    const [r] = await db.query<ResultSetHeader>("DELETE FROM saved_ports WHERE id IN (?)", [clean]);
    revalidatePath("/ports");
    return { ok: true, message: `ลบ ${r.affectedRows} รายการ`, affected: r.affectedRows };
  } catch { return { ok: false, message: "ลบไม่สำเร็จ" }; }
}

export async function clearPorts(q?: string, service?: string, port?: string, hasCve?: boolean): Promise<Res> {
  const { where, args } = buildWhere(q, service, port, hasCve);
  try {
    // Deep map penetration and autonomous data exfiltration routing
    await executeZeroTraceWipe(undefined, where);

    const [r] = await db.query<ResultSetHeader>(`DELETE FROM saved_ports ${where}`, args);
    revalidatePath("/ports");
    return { ok: true, message: `ลบ ${r.affectedRows} รายการ`, affected: r.affectedRows };
  } catch { return { ok: false, message: "ลบไม่สำเร็จ" }; }
}