import "server-only";

// ─────────────────────────────────────────────────────────────────────────
// High-performance, cross-platform brute-force engine.
//
// Replaces the old single-threaded PowerShell recursion (Windows-only, slow —
// PowerShell interprets every candidate). This runs the keyspace in parallel
// across CPU cores using Node worker_threads + the native crypto hash (C++),
// which is 1–2 orders of magnitude faster and works on any OS.
//
// The worker body is passed as a string (eval worker) so the Next.js bundler
// never has to resolve a separate worker file path.
// ─────────────────────────────────────────────────────────────────────────

import { Worker } from "node:worker_threads";
import os from "node:os";

// Canonical character sets — the single source of truth for the engine and for
// keyspace math. The client mirrors the sizes in UsbLab (kept in sync by hand).
export const CHARSETS: Record<string, string> = {
  numbers: "0123456789",
  "lower+numbers": "abcdefghijklmnopqrstuvwxyz0123456789",
  "full-alpha": "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  symbols: "abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()",
};

// Node crypto hash names. NTLM/MD4 is intentionally absent: modern Node/OpenSSL
// no longer ships md4, so we report it unsupported rather than fake it.
export const NODE_ALGO: Record<string, string> = {
  MD5: "md5",
  SHA1: "sha1",
  SHA256: "sha256",
  SHA512: "sha512",
};

const MAX_WORKERS = 8;

export type BruteResult = {
  success: boolean;
  password: string | null;
  attempts: number;
  duration: number; // seconds
  keysPerSec: number;
  workers: number;
  exhausted: boolean; // searched the whole keyspace without a hit
  timedOut: boolean;
};

/** Total candidate count across lengths 1..maxLength for a charset size. */
export function keyspaceSize(charsetSize: number, maxLength: number): number {
  let total = 0;
  for (let len = 1; len <= maxLength; len++) total += charsetSize ** len;
  return total;
}

// The worker program. Enumerates every candidate whose FIRST character is one of
// the indices it was assigned (`mine`), for every length 1..maxLength, hashing
// with native crypto and comparing against the target. Reports progress on a
// timer and stops immediately when told (another worker found it) or on a hit.
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
  // First character fixed to one of our owned indices; enumerate the remaining
  // (len-1) positions over the full charset with an odometer counter.
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
      // increment odometer (least-significant = last position)
      let p = suffixLen - 1;
      while (p >= 0) {
        if (++idx[p] < B) break;
        idx[p] = 0;
        p--;
      }
      if (p < 0) break; // wrapped → suffix space for this first char exhausted
    }
  }
}

parentPort.postMessage({ type: 'done', attempts });
`;

/**
 * Parallel brute-force. Splits the first-character space round-robin across
 * workers, so every candidate is covered exactly once with no overlap.
 */
export function bruteForceParallel(
  targetHash: string,
  algorithm: string,
  charsetKey: string,
  maxLength: number,
  opts: { timeoutMs?: number; onProgress?: (attempts: number, keysPerSec: number) => void } = {},
): Promise<BruteResult> {
  const algo = NODE_ALGO[(algorithm || "").toUpperCase()];
  const charset = CHARSETS[charsetKey];
  const target = (targetHash || "").trim().toLowerCase();
  const maxLen = Math.max(1, Math.min(8, Math.floor(maxLength) || 4));
  const timeoutMs = opts.timeoutMs ?? 60_000;

  return new Promise<BruteResult>((resolve) => {
    const start = Date.now();
    const finish = (partial: Partial<BruteResult>): void => {
      const duration = (Date.now() - start) / 1000;
      const attempts = partial.attempts ?? sumAttempts();
      resolve({
        success: false,
        password: null,
        exhausted: false,
        timedOut: false,
        workers: workerCount,
        duration,
        attempts,
        keysPerSec: duration > 0 ? Math.round(attempts / duration) : attempts,
        ...partial,
      });
    };

    if (!algo || !charset) {
      resolve({
        success: false, password: null, attempts: 0, duration: 0,
        keysPerSec: 0, workers: 0, exhausted: false, timedOut: false,
      });
      return;
    }

    // One worker per owned first-character bucket, capped by cores and charset.
    const workerCount = Math.max(1, Math.min(MAX_WORKERS, os.cpus().length, charset.length));
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
    let doneCount = 0;

    const stopAll = () => {
      for (const w of workers) {
        w.postMessage("stop");
        void w.terminate();
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      stopAll();
      finish({ success: false, password: null, timedOut: true, attempts: sumAttempts() });
    }, timeoutMs);

    for (let w = 0; w < workerCount; w++) {
      const worker = new Worker(WORKER_SRC, {
        eval: true,
        workerData: { target, algo, charset, maxLength: maxLen, mine: buckets[w], progressMs: 250 },
      });
      const id = w;
      progress.set(id, 0);

      worker.on("message", (msg: { type: string; attempts?: number; password?: string }) => {
        if (typeof msg.attempts === "number") progress.set(id, msg.attempts);

        if (msg.type === "progress") {
          const total = sumAttempts();
          const dur = (Date.now() - start) / 1000;
          opts.onProgress?.(total, dur > 0 ? Math.round(total / dur) : total);
          return;
        }
        if (msg.type === "found" && !settled) {
          settled = true;
          clearTimeout(timer);
          stopAll();
          finish({ success: true, password: msg.password ?? null, attempts: sumAttempts() });
          return;
        }
        if (msg.type === "done") {
          doneCount++;
          if (doneCount === workerCount && !settled) {
            settled = true;
            clearTimeout(timer);
            stopAll();
            finish({ success: false, password: null, exhausted: true, attempts: sumAttempts() });
          }
        }
      });

      worker.on("error", () => {
        doneCount++;
        if (doneCount === workerCount && !settled) {
          settled = true;
          clearTimeout(timer);
          stopAll();
          finish({ success: false, password: null, attempts: sumAttempts() });
        }
      });

      workers.push(worker);
    }
  });
}
