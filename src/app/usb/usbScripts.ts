import "server-only";

// RECON helpers for the Password Cracking Lab: hash identification, a
// dictionary + rules attack (native crypto), and keyspace feasibility. The
// heavy brute-force now lives in crackEngine.ts (parallel worker pool).

import { createHash } from "node:crypto";
import { CHARSETS, NODE_ALGO, keyspaceSize } from "./crackEngine";

export const IS_WINDOWS = process.platform === "win32";

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown cracking process error";
  return error.message;
}

export type CrackingTargetResult = {
  hash: string;
  success: boolean;
  password: string | null;
  attempts: number;
  duration: number;
  keysPerSec: number;
  workers: number;
  exhausted: boolean;
};

// ─────────────────────────────────────────────────────────────
// RECON — weakness analysis BEFORE brute-force (real-world method:
// identify the hash → try a wordlist/rules → only then brute-force).
// ─────────────────────────────────────────────────────────────

/** Identify likely hash algorithm(s) from the format/length. */
export function identifyHash(raw: string): { algorithms: string[]; note: string } {
  const s = (raw || "").trim();
  if (!s) return { algorithms: [], note: "ยังไม่มี hash" };
  if (/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(s))
    return { algorithms: ["bcrypt"], note: "bcrypt — ออกแบบให้ช้า, brute ตรง ๆ ไม่คุ้ม (ต้อง dictionary/targeted)" };
  if (/^\$argon2[id]{0,2}\$/.test(s))
    return { algorithms: ["argon2"], note: "argon2 — memory-hard, ไม่เหมาะกับ brute" };
  if (/^\$6\$/.test(s)) return { algorithms: ["sha512crypt"], note: "sha512crypt ($6$) — salted, ช้า" };
  if (/^\$5\$/.test(s)) return { algorithms: ["sha256crypt"], note: "sha256crypt ($5$) — salted, ช้า" };
  if (/^\$1\$/.test(s)) return { algorithms: ["md5crypt"], note: "md5crypt ($1$) — salted" };
  if (/^[a-f0-9]{32}$/i.test(s)) return { algorithms: ["MD5", "NTLM"], note: "32 hex → MD5 หรือ NTLM (NTLM ต้อง md4 — เครื่องยนต์รองรับเฉพาะ MD5)" };
  if (/^[a-f0-9]{40}$/i.test(s)) return { algorithms: ["SHA1"], note: "40 hex → SHA1" };
  if (/^[a-f0-9]{64}$/i.test(s)) return { algorithms: ["SHA256"], note: "64 hex → SHA256" };
  if (/^[a-f0-9]{128}$/i.test(s)) return { algorithms: ["SHA512"], note: "128 hex → SHA512" };
  return { algorithms: [], note: "รูปแบบไม่ตรง hash hex มาตรฐาน — ตรวจสอบอีกครั้ง" };
}

// Compact high-value wordlist (top weak passwords + common bases). Mutations add
// the usual "rules" (digits, year, symbol, capitalize, leet) real crackers apply.
const COMMON_BASES = [
  "password", "123456", "123456789", "12345678", "12345", "qwerty", "abc123",
  "football", "monkey", "letmein", "dragon", "111111", "baseball", "iloveyou",
  "trustno1", "sunshine", "master", "welcome", "shadow", "ashley", "michael",
  "superman", "batman", "admin", "root", "toor", "login", "guest", "test",
  "oracle", "mysql", "postgres", "redis", "server", "changeme", "secret",
  "pass", "passw0rd", "p@ssw0rd", "qazwsx", "zaq12wsx", "1q2w3e4r", "1qaz2wsx",
  "princess", "flower", "hello", "freedom", "whatever", "ninja", "azerty",
  "solo", "loveme", "starwars", "cheese", "summer", "winter", "spring", "autumn",
  "hunter", "harley", "ranger", "jordan", "soccer", "hockey", "killer", "george",
  "computer", "michelle", "jessica", "pepper", "daniel", "access", "yankees",
  "thomas", "tigger", "robert", "thunder", "cowboy", "nicole", "jennifer",
  "corvette", "bigdog", "hannah", "maggie", "ginger", "hammer", "silver",
  "banana", "chicken", "please", "andrew", "charlie", "samsung", "google",
  "internet", "service", "database", "network", "default", "system", "manager",
  // extended common set
  "admin123", "root123", "welcome1", "password1", "password123", "letmein1",
  "qwerty123", "iloveyou1", "administrator", "supervisor", "operator", "backup",
  "demo", "temp", "user", "sales", "office", "support", "security", "firewall",
  "cisco", "linux", "windows", "ubuntu", "centos", "docker", "kubernetes",
  "jenkins", "gitlab", "github", "aws", "azure", "cloud", "api", "token",
  "monday", "friday", "money", "qwertyuiop", "asdfghjkl", "zxcvbnm", "000000",
  "121212", "654321", "696969", "666666", "7777777", "123123", "abcdef",
  "passw0rd!", "P@ssw0rd", "Passw0rd!", "Admin@123", "Welcome@123",
];

const YEARS = ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"];

function leet(s: string): string {
  return s
    .replace(/a/gi, "@")
    .replace(/s/gi, "$")
    .replace(/o/gi, "0")
    .replace(/i/gi, "1")
    .replace(/e/gi, "3");
}

function mutations(base: string): string[] {
  const cap = base.length ? base[0].toUpperCase() + base.slice(1) : base;
  const out = [
    base, cap, base.toUpperCase(),
    base + "1", base + "12", base + "123", base + "1234", base + "0",
    base + "!", base + "@", base + "#", base + "$", base + "!!",
    cap + "1", cap + "123", cap + "!", cap + "@123", cap + "#1",
    base + base, leet(base), leet(cap),
  ];
  for (const y of YEARS) {
    out.push(base + y);
    out.push(cap + y);
    out.push(base + y + "!");
    out.push(base + "@" + y);
  }
  return out;
}

/** Dictionary + rule-based attack using Node crypto (fast, no subprocess). */
export function dictionaryAttack(
  targetHash: string,
  algorithm: string,
): { supported: boolean; found: boolean; password: string | null; tested: number } {
  const algo = NODE_ALGO[(algorithm || "").toUpperCase()];
  if (!algo) return { supported: false, found: false, password: null, tested: 0 };
  const target = (targetHash || "").trim().toLowerCase();
  const seen = new Set<string>();
  let tested = 0;
  for (const base of COMMON_BASES) {
    for (const cand of mutations(base)) {
      if (seen.has(cand)) continue;
      seen.add(cand);
      tested++;
      const h = createHash(algo).update(cand, "utf8").digest("hex");
      if (h === target) return { supported: true, found: true, password: cand, tested };
    }
  }
  return { supported: true, found: false, password: null, tested };
}

/** Estimate brute-force keyspace + feasibility for a charset/length. */
export function keyspaceAssessment(
  charset: string,
  maxLength: number,
): { size: number; combos: number; feasibility: "fast" | "feasible" | "hard" | "infeasible" } {
  const size = (CHARSETS[charset] ?? CHARSETS["lower+numbers"]).length;
  const n = Math.max(1, Math.min(8, Math.floor(maxLength) || 4));
  const combos = keyspaceSize(size, n);
  let feasibility: "fast" | "feasible" | "hard" | "infeasible";
  // Thresholds reflect the parallel native engine (millions of keys/sec/core).
  if (combos < 5e6) feasibility = "fast";
  else if (combos < 5e8) feasibility = "feasible";
  else if (combos < 1e11) feasibility = "hard";
  else feasibility = "infeasible";
  return { size, combos, feasibility };
}
