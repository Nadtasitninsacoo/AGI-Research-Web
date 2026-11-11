import "server-only";

// RECON & Advanced Security Intelligence Engine for Password Assessment Lab
// Integrates Shannon Entropy, Advanced Pattern Anomaly, k-Anonymity Breached Checks,
// Contextual Risk, and Secure Hash Assessment.

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
// RECON & HASH IDENTIFICATION
// ─────────────────────────────────────────────────────────────

/** Identify likely hash algorithm(s) from the format/length with secure intelligence grading. */
export function identifyHash(raw: string): { algorithms: string[]; note: string; riskLevel: string } {
  const s = (raw || "").trim();
  if (!s) return { algorithms: [], note: "ยังไม่มี hash", riskLevel: "UNKNOWN" };
  if (/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(s))
    return { algorithms: ["bcrypt"], note: "bcrypt — ออกแบบให้ช้าด้วย cost factor, ป้องกัน brute-force ได้ดีเยี่ยม", riskLevel: "HIGH" };
  if (/^\$argon2[id]{0,2}\$/.test(s))
    return { algorithms: ["argon2"], note: "argon2 — memory-hard function, ป้องกัน GPU brute-force สูงสุด", riskLevel: "OPTIMAL" };
  if (/^\$6\$/.test(s)) return { algorithms: ["sha512crypt"], note: "sha512crypt ($6$) — salted, ช้าและปลอดภัยระดับปานกลาง", riskLevel: "MODERATE" };
  if (/^\$5\$/.test(s)) return { algorithms: ["sha256crypt"], note: "sha256crypt ($5$) — salted, ปลอดภัยกว่า MD5", riskLevel: "MODERATE" };
  if (/^\$1\$/.test(s)) return { algorithms: ["md5crypt"], note: "md5crypt ($1$) — salted แบบเก่า, ถูกถอดรหัสได้ง่ายด้วย GPU", riskLevel: "VULNERABLE" };
  if (/^[a-f0-9]{32}$/i.test(s)) return { algorithms: ["MD5", "NTLM"], note: "32 hex → MD5 หรือ NTLM (ไม่มี Salt เสี่ยงต่อ Rainbow Table และ Brute-force ความเร็วสูง)", riskLevel: "CRITICAL" };
  if (/^[a-f0-9]{40}$/i.test(s)) return { algorithms: ["SHA1"], note: "40 hex → SHA1 (ล้าสมัยและไม่ปลอดภัยต่อการชนกันของข้อมูล)", riskLevel: "CRITICAL" };
  if (/^[a-f0-9]{64}$/i.test(s)) return { algorithms: ["SHA256"], note: "64 hex → SHA256 (เร็วเกินไปสำหรับการแฮชรหัสผ่านโดยไม่มี Salt/Key Derivation)", riskLevel: "HIGH_RISK" };
  if (/^[a-f0-9]{128}$/i.test(s)) return { algorithms: ["SHA512"], note: "128 hex → SHA512 (ความปลอดภัยสูงขึ้น แต่ยังต้องการ Salt เพื่อป้องกันคลังแฮช)", riskLevel: "MODERATE" };
  return { algorithms: [], note: "รูปแบบไม่ตรง hash hex มาตรฐาน — ตรวจสอบรูปแบบอีกครั้ง", riskLevel: "UNKNOWN" };
}

// Comprehensive weak base passwords list expanded to maximum warfare-grade penetration auditing
const COMPREHENSIVE_WEAK_BASES = new Set([
  // ── 1. Basic & Ultra-Common Passwords ───────────────────────────────
  "password", "123456", "123456789", "12345678", "12345", "1234", "123",
  "qwerty", "abc123", "football", "monkey", "letmein", "dragon", "111111",
  "baseball", "iloveyou", "trustno1", "sunshine", "master", "welcome",
  "shadow", "ashley", "michael", "superman", "batman", "admin", "root",
  "toor", "login", "guest", "test", "default", "system", "operator",

  // ── 2. Database, Middleware & Server Defaults ───────────────────────
  "oracle", "mysql", "postgres", "postgresql", "redis", "mongodb", "memsql",
  "cassandra", "elasticsearch", "kafka", "rabbitmq", "server", "changeme",
  "secret", "pass", "passw0rd", "p@ssw0rd", "qazwsx", "zaq12wsx", "1q2w3e4r",
  "1qaz2wsx", "password123!", "Admin@2026", "Root!2026", "Database123!",

  // ── 3. Names, Pop Culture & Seasons ─────────────────────────────────
  "princess", "flower", "hello", "freedom", "whatever", "ninja", "azerty",
  "solo", "loveme", "starwars", "cheese", "summer", "winter", "spring",
  "autumn", "hunter", "harley", "ranger", "jordan", "soccer", "hockey",
  "killer", "george", "computer", "michelle", "jessica", "pepper", "daniel",
  "access", "yankees", "thomas", "tigger", "robert", "thunder", "cowboy",
  "nicole", "jennifer", "charlie", "david", "matrix", "shadow1", "buster",

  // ── 4. Number Appended & Corporate Variants ─────────────────────────
  "admin123", "root123", "welcome1", "password1", "password123", "letmein1",
  "qwerty123", "iloveyou1", "administrator", "supervisor", "backup", "support",
  "manager", "director", "finance", "hrdept", "itdept", "sales01", "dev01",

  // ── 5. IT Infrastructure, Cloud & DevOps Defaults ────────────────────
  "demo", "temp", "user", "sales", "office", "security", "firewall", "router",
  "switch", "gateway", "cisco", "juniper", "huawei", "mikrotik", "linux",
  "windows", "ubuntu", "centos", "debian", "redhat", "docker", "kubernetes",
  "k8s", "jenkins", "gitlab", "github", "bitbucket", "aws", "azure", "gcp",
  "cloud", "api", "token", "oauth", "bearer", "graphql", "webhook",

  // ── 6. Sequences, Repeating & Pattern Data ───────────────────────────
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "december", "money", "qwertyuiop", "asdfghjkl",
  "zxcvbnm", "000000", "121212", "654321", "696969", "666666", "7777777",
  "123123", "abcdef", "1234567890", "qweasdzxc", "zxcvbnmasd",

  // ── 7. Complex Symbols, Leet Speak & Modern Years ────────────────────
  "passw0rd!", "P@ssw0rd", "Passw0rd!", "Admin@123", "Welcome@123",
  "P@ssw0rd123!", "Admin#2026", "Default123", "ChangeMe!", "Sysadmin123",
  "Root@1234", "MasterKey1", "Security!", "Access2026", "Test12345!",
  "ServiceAccount", "InternalPass", "NetworkAdmin", "Database2026!",
  "ApiToken2026", "CloudAdmin!", "SuperUser123", "Enterprise2026",
  "Password@2025", "Password@2026", "Admin@2025", "Root@2025",
  "P@ssw0rd2026!", "Welcome@2026#", "System*2026", "Cyber!2026"
]);

const KEYBOARD_WALKS = [
  "qwertyuiop", "asdfghjkl", "zxcvbnm",
  "1234567890", "qazwsxedcrfvtgbyhnujmikolp"
];

const YEARS = ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026", "2027"];

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

/** 1. Shannon Entropy Analysis */
export function calculateEntropy(password: string) {
  if (!password || typeof password !== "string") return { length: 0, charsetSize: 0, shannonBits: 0, maxPossibleBits: 0 };
  
  let charsetSize = 0;
  if (/[a-z]/.test(password)) charsetSize += 26;
  if (/[A-Z]/.test(password)) charsetSize += 26;
  if (/[0-9]/.test(password)) charsetSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 33;

  if (charsetSize === 0) return { length: password.length, charsetSize: 0, shannonBits: 0, maxPossibleBits: 0 };

  const frequencies: Record<string, number> = {};
  for (const char of password) {
    frequencies[char] = (frequencies[char] || 0) + 1;
  }

  let entropy = 0;
  const len = password.length;
  for (const char in frequencies) {
    const p = frequencies[char] / len;
    entropy -= p * Math.log2(p);
  }

  const totalBits = len * Math.log2(charsetSize);
  return {
    length: len,
    charsetSize,
    shannonBits: Number((entropy * len).toFixed(2)),
    maxPossibleBits: Number(totalBits.toFixed(2))
  };
}

/** 2. Advanced Pattern & Anomaly Detection */
export function detectPatterns(password: string): string[] {
  const issues: string[] = [];
  const lower = password.toLowerCase();

  if (COMPREHENSIVE_WEAK_BASES.has(lower)) {
    issues.push("EXACT_DICTIONARY_MATCH");
  }

  if (/(.)\1{2,}/.test(password)) {
    issues.push("REPEATING_CHARACTERS");
  }

  for (const walk of KEYBOARD_WALKS) {
    for (let i = 0; i < walk.length - 3; i++) {
      const sub = walk.substring(i, i + 4);
      if (lower.includes(sub) || lower.includes(sub.split("").reverse().join(""))) {
        issues.push("KEYBOARD_WALK_OR_SEQUENCE");
        break;
      }
    }
  }

  if (/(19[5-9]\d|20[0-4]\d)/.test(password)) {
    issues.push("CONTAINS_COMMON_YEAR");
  }

  return issues;
}

/** 3. Breached Password Intelligence (k-Anonymity API Check) */
export async function checkBreachedIntelligence(password: string): Promise<{ breached: boolean; count: number; error?: string }> {
  try {
    const sha1Hash = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1Hash.substring(0, 5);
    const suffix = sha1Hash.substring(5);

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'User-Agent': 'DARK-AGI-Security-Intelligence-Engine/6.0' },
      signal: AbortSignal.timeout(3500)
    });

    if (!response.ok) return { breached: false, count: 0, error: "API_UNAVAILABLE" };

    const text = await response.text();
    const lines = text.split('\n');
    
    for (const line of lines) {
      const [hashSuffix, countStr] = line.trim().split(':');
      if (hashSuffix === suffix) {
        return { breached: true, count: parseInt(countStr, 10) || 1 };
      }
    }

    return { breached: false, count: 0 };
  } catch {
    return { breached: false, count: 0, error: "TIMEOUT_OR_NETWORK_ERROR" };
  }
}

/** 4. Contextual Password Risk Assessment */
export function assessContextualRisk(password: string, userInfo: { username?: string; email?: string; fullName?: string } = {}): string[] {
  const riskFactors: string[] = [];
  const lowerPwd = password.toLowerCase();

  if (userInfo.username && lowerPwd.includes(userInfo.username.toLowerCase())) {
    riskFactors.push("CONTAINS_USERNAME");
  }
  if (userInfo.email && lowerPwd.includes(userInfo.email.split('@')[0].toLowerCase())) {
    riskFactors.push("CONTAINS_EMAIL_IDENTIFIER");
  }
  if (userInfo.fullName && userInfo.fullName.split(' ').some(part => part.length > 2 && lowerPwd.includes(part.toLowerCase()))) {
    riskFactors.push("CONTAINS_USER_NAME_PART");
  }

  return riskFactors;
}

/** 5. Secure Hash Assessment */
export function assessHashSecurity(hashString: string) {
  if (!hashString || typeof hashString !== "string") {
    return { algorithm: "UNKNOWN", secure: false, rating: "INVALID_HASH" };
  }

  if (hashString.startsWith('$argon2')) {
    return { algorithm: "Argon2", secure: true, rating: "OPTIMAL" };
  }
  if (hashString.startsWith('$2b$') || hashString.startsWith('$2a$') || hashString.startsWith('$2y$')) {
    return { algorithm: "Bcrypt", secure: true, rating: "GOOD" };
  }
  if (hashString.includes('pbkdf2')) {
    return { algorithm: "PBKDF2", secure: true, rating: "ACCEPTABLE" };
  }
  if (/^[a-fA-F0-9]{32}$/.test(hashString)) {
    return { algorithm: "MD5", secure: false, rating: "CRITICAL_VULNERABILITY_UNSALTED" };
  }
  if (/^[a-fA-F0-9]{40}$/.test(hashString)) {
    return { algorithm: "SHA-1", secure: false, rating: "CRITICAL_VULNERABILITY_OBSOLETE" };
  }
  if (/^[a-fA-F0-9]{64}$/.test(hashString)) {
    return { algorithm: "SHA256", secure: false, rating: "HIGH_RISK_FAST_HASH" };
  }

  return { algorithm: "UNKNOWN_OR_CUSTOM", secure: false, rating: "REVIEW_REQUIRED" };
}

/** Comprehensive Password Strength Estimation Pipeline */
export async function evaluatePasswordStrength(password: string, userInfo: { username?: string; email?: string; fullName?: string } = {}) {
  const entropy = calculateEntropy(password);
  const patterns = detectPatterns(password);
  const contextualRisks = assessContextualRisk(password, userInfo);
  const breachInfo = await checkBreachedIntelligence(password);

  let score = 50;
  score += Math.min(entropy.shannonBits * 1.5, 30);
  score -= patterns.length * 15;
  score -= contextualRisks.length * 20;
  if (breachInfo.breached) score -= 50;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let strengthLevel = "VERY_WEAK";
  if (score >= 80) strengthLevel = "STRONG";
  else if (score >= 60) strengthLevel = "MODERATE";
  else if (score >= 40) strengthLevel = "WEAK";

  return {
    score,
    strengthLevel,
    entropyDetails: entropy,
    detectedPatterns: patterns,
    contextualRisks,
    breachIntelligence: breachInfo,
    timestamp: new Date().toISOString()
  };
}

// ─────────────────────────────────────────────────────────────
// DICTIONARY ATTACK & KEYSPACE ASSESSMENT (High-Performance Batch Mode)
// ─────────────────────────────────────────────────────────────

/** Dictionary + rule-based attack using Node crypto with batch processing for high throughput. */
export function dictionaryAttack(
  targetHash: string,
  algorithm: string,
  maxBatchSize: number = 5000000,
): { supported: boolean; found: boolean; password: string | null; tested: number } {
  const algo = NODE_ALGO[(algorithm || "").toUpperCase()];
  if (!algo) return { supported: false, found: false, password: null, tested: 0 };
  
  const target = (targetHash || "").trim().toLowerCase();
  const seen = new Set<string>();
  let tested = 0;

  // ประมวลผลด้วยความเร็วสูงและจำกัดขนาดต่อรอบเพื่อป้องกันหน่วยความจำเต็ม
  for (const base of COMPREHENSIVE_WEAK_BASES) {
    for (const cand of mutations(base)) {
      if (seen.has(cand)) continue;
      seen.add(cand);
      tested++;

      // คำนวณแฮชด้วย Node crypto
      const h = createHash(algo).update(cand, "utf8").digest("hex");
      if (h === target) {
        return { supported: true, found: true, password: cand, tested };
      }

      // หากทดสอบถึงขีดจำกัดที่กำหนดต่อรอบ (เช่น 5,000,000 รหัส) ให้คืนค่าสถานะเพื่อความปลอดภัยของระบบ
      if (tested >= maxBatchSize) {
        return { supported: true, found: false, password: null, tested };
      }
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
  if (combos < 5e6) feasibility = "fast";
  else if (combos < 5e8) feasibility = "feasible";
  else if (combos < 1e11) feasibility = "hard";
  else feasibility = "infeasible";
  return { size, combos, feasibility };
}