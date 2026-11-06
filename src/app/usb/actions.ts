"use server";

// Password Cracking & Hash Decryption Server Actions Engine

import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import {
  IS_WINDOWS,
  getErrorMessage,
  executeRealCrackingJob,
  parseCrackingOutput,
  identifyHash,
  dictionaryAttack,
  keyspaceAssessment,
  type CrackingTargetResult,
} from "./usbScripts";

export type { CrackingTargetResult } from "./usbScripts";

export type HashAnalysis = {
  ok: boolean;
  hash: string;
  detected: { algorithms: string[]; note: string; matchesSelected: boolean };
  dictionary: { supported: boolean; found: boolean; password: string | null; tested: number };
  keyspace: { size: number; combos: number; feasibility: string };
  recommendation: string;
  output: string;
};

/**
 * RECON before cracking (the real-world method): identify the hash, try a
 * wordlist + rules first, assess brute-force feasibility, and recommend a plan —
 * instead of blindly brute-forcing. All computed locally (Node crypto).
 */
export async function analyzeHash(
  targetHash?: string,
  algorithm: string = "SHA256",
  charset: string = "lower+numbers",
  maxLength: number = 4,
): Promise<HashAnalysis> {
  const hash = (targetHash || "").trim();
  const empty: HashAnalysis = {
    ok: false,
    hash,
    detected: { algorithms: [], note: "ยังไม่มี hash", matchesSelected: false },
    dictionary: { supported: false, found: false, password: null, tested: 0 },
    keyspace: { size: 0, combos: 0, feasibility: "fast" },
    recommendation: "",
    output: "",
  };
  if (!hash) return { ...empty, output: "ใส่ Target Hash ก่อนทำ RECON" };

  const detected = identifyHash(hash);
  const matchesSelected =
    detected.algorithms.length === 0 ||
    detected.algorithms.map((a) => a.toUpperCase()).includes(algorithm.toUpperCase());

  const dictionary = dictionaryAttack(hash, algorithm);
  const keyspace = keyspaceAssessment(charset, maxLength);

  let recommendation: string;
  if (dictionary.found) {
    recommendation = `พบใน dictionary ทันที → "${dictionary.password}" · ไม่ต้อง brute-force (รหัสอ่อนมาก)`;
  } else if (!matchesSelected && detected.algorithms.length) {
    recommendation = `อัลกอริทึมที่เลือก (${algorithm}) อาจไม่ตรง — hash นี้น่าจะเป็น ${detected.algorithms.join("/")} · แก้ให้ตรงก่อนแครก`;
  } else if (!dictionary.supported) {
    recommendation = `อัลกอริทึม ${algorithm} ไม่รองรับ dictionary ในเครื่อง — ข้ามไป brute/targeted`;
  } else if (keyspace.feasibility === "infeasible") {
    recommendation = `ไม่พบใน dictionary · keyspace ใหญ่เกินไป (${charset}, ยาว ${maxLength}) — brute ไม่คุ้ม, ใช้ wordlist/rule หรือ targeted attack`;
  } else {
    recommendation = `ไม่พบใน dictionary → ใช้ brute-force ${charset} ยาว 1-${maxLength} (ความเป็นไปได้: ${keyspace.feasibility})`;
  }

  const output = [
    "[RECON — WEAKNESS ANALYSIS]",
    `Target: ${hash}`,
    `ชนิด hash ที่เป็นไปได้: ${detected.algorithms.join(", ") || "ไม่ทราบ"} · ${detected.note}`,
    `อัลกอริทึมที่เลือก: ${algorithm} ${matchesSelected ? "(ตรง)" : "(อาจไม่ตรง!)"}`,
    `Dictionary: ทดสอบ ${dictionary.tested} รายการ → ${dictionary.found ? `พบ: ${dictionary.password}` : "ไม่พบ"}`,
    `Keyspace brute: ~${keyspace.combos.toLocaleString("en-US")} (${keyspace.feasibility})`,
    `แนะนำ: ${recommendation}`,
  ].join("\n");

  return {
    ok: true,
    hash,
    detected: { ...detected, matchesSelected },
    dictionary,
    keyspace,
    recommendation,
    output,
  };
}

export type TeamAgent = {
  id: number;
  name: string;
  status: string;
  model: string | null;
};

/**
 * Real agents from the platform DB, used to crew the USB Lab team (Full Auto).
 * Running agents first. Returns [] honestly if the table/DB is unavailable —
 * the UI then shows "no agents registered" instead of fake personas.
 */
export async function listTeamAgents(): Promise<TeamAgent[]> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, name, status, model
       FROM agents
       WHERE status <> 'retired'
       ORDER BY (status = 'running') DESC, id
       LIMIT 24`,
    );
    return rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      status: r.status != null ? String(r.status) : "idle",
      model: r.model != null ? String(r.model) : null,
    }));
  } catch {
    return [];
  }
}

/**
 * ดำเนินการสุ่มรหัสผ่าน (Brute-force / Dictionary Attack) ผ่านระบบหลังบ้าน
 */
export async function bruteForceAction(
  targetHash?: string,
  algorithm: string = "SHA256",
  charset: string = "lower+numbers",
  maxLength: number = 4
): Promise<{
  ok: boolean;
  found: boolean;
  output: string;
  data?: CrackingTargetResult[];
}> {
  if (!IS_WINDOWS) {
    return {
      ok: false,
      found: false,
      output: "Password cracking execution requires a Windows host environment.",
    };
  }

  const cleanHash = targetHash ? targetHash.trim() : "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"; // Default test hash for 'password' (SHA256)

  try {
    const rawOutput = await executeRealCrackingJob(cleanHash, algorithm, charset, maxLength, 60_000);
    const results = parseCrackingOutput(rawOutput);
    const matched = results.find((r) => r.success);

    return {
      ok: true,
      found: !!matched,
      output: `[SUCCESS] ดำเนินการแครกแฮชสำเร็จผ่าน .NET Cryptography Engine\nTarget Hash: ${cleanHash}\nResult: ${matched ? `พบรหัสผ่าน -> ${matched.password}` : "ไม่พบรหัสผ่านในเงื่อนไขที่กำหนด"}\nTotal Attempts: ${matched?.attempts ?? 0}\nDuration: ${matched?.duration.toFixed(2) ?? 0}s`,
      data: results,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      found: false,
      output: `Brute-force execution failed: ${getErrorMessage(error)}`,
    };
  }
}

/**
 * ดำเนินการถอดรหัสแฮช (Hash Decryption / Lookup Engine)
 */
export async function hashDecryptAction(
  targetHash?: string,
  algorithm: string = "SHA256"
): Promise<{
  ok: boolean;
  output: string;
}> {
  if (!IS_WINDOWS) {
    return {
      ok: false,
      output: "Hash decryption requires a Windows host environment.",
    };
  }

  const cleanHash = targetHash ? targetHash.trim() : "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8";

  try {
    // เรียกใช้งานระบบตรวจสอบแฮชด้วยความเร็วสูงผ่านกระบวนการประมวลผลจริง
    const rawOutput = await executeRealCrackingJob(cleanHash, algorithm, "lower+numbers", 4, 30_000);
    const results = parseCrackingOutput(rawOutput);
    const matched = results.find((r) => r.success);

    return {
      ok: true,
      output: `[HASH DECRYPTION REPORT]\nAlgorithm: ${algorithm}\nTarget: ${cleanHash}\nStatus: ${matched ? "RECOVERED" : "NOT_FOUND"}\nPlaintext: ${matched?.password ?? "N/A"}\nAttempts: ${matched?.attempts ?? 0}`,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      output: `Hash decryption failed: ${getErrorMessage(error)}`,
    };
  }
}