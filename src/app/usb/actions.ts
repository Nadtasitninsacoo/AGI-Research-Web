"use server";

// Password Cracking & Hash Decryption Server Actions Engine

import {
  IS_WINDOWS,
  getErrorMessage,
  executeRealCrackingJob,
  parseCrackingOutput,
  type CrackingTargetResult,
} from "./usbScripts";

export type { CrackingTargetResult } from "./usbScripts";

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