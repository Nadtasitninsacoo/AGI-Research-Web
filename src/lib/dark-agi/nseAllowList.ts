// Client-side mirror of engine/src/nmapGuard.mjs's NSE allow-list. Used by
// the DARK AGI Terminal's os-fingerprint/script-scan form to reject unsafe
// script names BEFORE submitting — DARK AGI's own server-side validation is
// the real authority; this only gives a human operator (or the AI-mode
// instruction box) a clear, immediate reason instead of a raw 422.
//
// Kept intentionally in sync with the engine's list by hand (two different
// runtimes, no shared import path) — change both together.

export const ALLOWED_NSE_NAMES = new Set([
  "default",
  "safe",
  "discovery",
  "version",
  "auth",
  "banner",
  "http-title",
  "http-headers",
  "ssl-cert",
  "ssh-hostkey",
  "dns-brute",
]);

const BLOCKED_CATEGORIES = new Set(["intrusive", "brute", "dos", "exploit", "fuzzer", "vuln"]);

const SAFE_NAME = /^[a-z0-9_-]+$/i;

export type NseValidation =
  | { ok: true; scripts: string[] }
  | { ok: false; reason: string; rejected: string[] };

export function validateNseScripts(scripts: string[]): NseValidation {
  if (!Array.isArray(scripts) || scripts.length === 0) {
    return { ok: false, reason: "ต้องระบุ script อย่างน้อย 1 รายการ", rejected: [] };
  }
  const rejected: string[] = [];
  const clean: string[] = [];
  for (const raw of scripts) {
    const name = String(raw ?? "").trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    if (!SAFE_NAME.test(name) || name.includes("..") || name.includes("/") || name.includes("\\")) {
      rejected.push(name);
      continue;
    }
    if (lower.endsWith(".lua") || BLOCKED_CATEGORIES.has(lower) || !ALLOWED_NSE_NAMES.has(lower)) {
      rejected.push(name);
      continue;
    }
    clean.push(lower);
  }
  if (rejected.length > 0) {
    return {
      ok: false,
      reason: `ไม่อยู่ใน allow-list หรือไม่ปลอดภัย: ${rejected.join(", ")}`,
      rejected,
    };
  }
  if (clean.length === 0) return { ok: false, reason: "ไม่มี script ที่ใช้ได้", rejected: [] };
  return { ok: true, scripts: [...new Set(clean)] };
}

export function clampMaxRate(value: number | null | undefined, cap: number, fallback = 500): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Math.min(fallback, cap);
  return Math.max(1, Math.min(Math.round(n), cap));
}

export function parseTargetsInput(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}
