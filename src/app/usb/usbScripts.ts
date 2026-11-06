import "server-only";

// Real Password Cracking & Hash Verification Engine (Server-side Helpers)

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

const run = promisify(execFile);
export const IS_WINDOWS = process.platform === "win32";
const MAX_BUFFER = 10_000_000;

// Whitelists for strict input validation
const VALID_ALGORITHMS = ["MD5", "SHA1", "SHA256", "SHA512"] as const;
const VALID_CHARSETS = ["lower+numbers", "full-alpha", "symbols"] as const;

type CommandError = Error & {
  stderr?: string;
  code?: string | number;
};

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown cracking process error";

  const commandError = error as CommandError;
  const detail = commandError.stderr?.trim();

  return detail ? `${commandError.message}: ${detail}` : commandError.message;
}

/**
 * Executes a real password cracking and hash verification job via PowerShell (.NET Cryptography)
 */
export async function executeRealCrackingJob(
  targetHash: string,
  algorithm: string = "SHA256",
  charsetType: string = "lower+numbers",
  maxLength: number = 4,
  timeout: number = 60_000
): Promise<string> {
  // 1. Strict Input Validation & Whitelisting in TypeScript
  const cleanHash = targetHash ? targetHash.trim() : "";
  if (!cleanHash) {
    throw new Error("Target hash cannot be empty.");
  }

  const upperAlgo = algorithm.toUpperCase().trim();
  if (!VALID_ALGORITHMS.includes(upperAlgo as any)) {
    throw new Error(`Unsupported algorithm: ${algorithm}. Allowed: ${VALID_ALGORITHMS.join(", ")}`);
  }

  const cleanCharset = charsetType.trim();
  if (!VALID_CHARSETS.includes(cleanCharset as any)) {
    throw new Error(`Invalid charset type: ${charsetType}. Allowed: ${VALID_CHARSETS.join(", ")}`);
  }

  const safeMaxLength = Number.isInteger(maxLength) && maxLength > 0 && maxLength <= 8 ? maxLength : 4;
  const safeTimeout = Number.isInteger(timeout) && timeout > 0 ? timeout : 60_000;
  const safeHash = cleanHash.replace(/'/g, "''");

  // PowerShell script utilizing Hashtable state and strict cryptographic verification
  const realCrackingScript = `
$ErrorActionPreference = 'Stop'
$TargetHash = '${safeHash}'
$Algorithm = '${upperAlgo}'
$CharsetType = '${cleanCharset}'
$MaxLength = [int]'${safeMaxLength}'

# Define character sets based on validated input
$chars = switch ($CharsetType) {
    'lower+numbers' { 'abcdefghijklmnopqrstuvwxyz0123456789'.ToCharArray() }
    'full-alpha'    { 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.ToCharArray() }
    'symbols'       { 'abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()'.ToCharArray() }
    default         { throw "Invalid charset configuration" }
}

# Use a hashtable for safe mutable state tracking across recursive calls
$crackState = @{
    Found = $false
    RecoveredPassword = $null
    Attempts = 0
}

function Test-HashMatch {
    param([string]$password)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($password)
    $hashObj = $null
    try {
        $hashObj = switch ($Algorithm) {
            'MD5'    { [System.Security.Cryptography.MD5]::Create() }
            'SHA1'   { [System.Security.Cryptography.SHA1]::Create() }
            'SHA256' { [System.Security.Cryptography.SHA256]::Create() }
            'SHA512' { [System.Security.Cryptography.SHA512]::Create() }
            default  { throw "Unsupported algorithm: $Algorithm" }
        }

        $hashBytes = $hashObj.ComputeHash($bytes)
        $hashString = [BitConverter]::ToString($hashBytes) -replace '-'
        return ($hashString.ToUpper() -eq $TargetHash.ToUpper())
    }
    finally {
        if ($hashObj -ne $null -and $hashObj -is [IDisposable]) {
            $hashObj.Dispose()
        }
    }
}

function Invoke-BruteForce {
    param([char[]]$current, [int]$index, [int]$targetLen)
    if ($crackState.Found) { return }
    
    $crackState.Attempts++

    if ($index -eq 0) {
        $candidate = -join $current
        if (Test-HashMatch -password $candidate) {
            $crackState.Found = $true
            $crackState.RecoveredPassword = $candidate
        }
        return
    }

    foreach ($c in $chars) {
        if ($crackState.Found) { return }
        $current[$targetLen - $index] = $c
        Invoke-BruteForce -current $current -index ($index - 1) -targetLen $targetLen
    }
}

$startTime = Get-Date

for ($len = 1; $len -le $MaxLength; $len++) {
    if ($crackState.Found) { break }
    $buffer = New-Object char[] $len
    Invoke-BruteForce -current $buffer -index $len -targetLen $len
}

$endTime = Get-Date
$duration = ($endTime - $startTime).TotalSeconds

[pscustomobject]@{
    TargetHash = $TargetHash
    Success = [bool]$crackState.Found
    RecoveredPassword = $crackState.RecoveredPassword
    TotalAttempts = [int]$crackState.Attempts
    DurationSeconds = [double]$duration
} | ConvertTo-Json -Depth 4 -Compress
  `;

  const { stdout } = await run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", realCrackingScript],
    {
      timeout: safeTimeout,
      windowsHide: true,
      maxBuffer: MAX_BUFFER,
    },
  );

  return stdout.trim();
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value;

  if (value && typeof value === "object") {
    return [value as T];
  }

  return [];
}

export function parseJson<T>(output: string): T[] {
  if (!output || !output.trim()) return [];

  try {
    const parsed = JSON.parse(output.trim());
    return asArray<T>(parsed);
  } catch {
    throw new Error(`Failed to parse PowerShell JSON output: ${output}`);
  }
}

export type CrackingRow = {
  TargetHash?: string;
  Success?: boolean;
  RecoveredPassword?: string;
  TotalAttempts?: number;
  DurationSeconds?: number;
};

export type CrackingTargetResult = {
  hash: string;
  success: boolean;
  password: string | null;
  attempts: number;
  duration: number;
};

export function parseCrackingOutput(output: string): CrackingTargetResult[] {
  const rows = parseJson<CrackingRow>(output);

  return rows.map((row) => ({
    hash: row.TargetHash ?? "Unknown",
    success: row.Success === true,
    password: row.RecoveredPassword ?? null,
    attempts: typeof row.TotalAttempts === "number" ? row.TotalAttempts : 0,
    duration: typeof row.DurationSeconds === "number" ? row.DurationSeconds : 0,
  }));
}

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
  if (/^[a-f0-9]{32}$/i.test(s)) return { algorithms: ["MD5", "NTLM"], note: "32 hex → MD5 หรือ NTLM" };
  if (/^[a-f0-9]{40}$/i.test(s)) return { algorithms: ["SHA1"], note: "40 hex → SHA1" };
  if (/^[a-f0-9]{64}$/i.test(s)) return { algorithms: ["SHA256"], note: "64 hex → SHA256" };
  if (/^[a-f0-9]{128}$/i.test(s)) return { algorithms: ["SHA512"], note: "128 hex → SHA512" };
  return { algorithms: [], note: "รูปแบบไม่ตรง hash hex มาตรฐาน — ตรวจสอบอีกครั้ง" };
}

// Compact high-value wordlist (top weak passwords + common bases). Mutations add
// the usual "rules" (digits, year, symbol, capitalize) that real crackers apply.
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
];

const YEARS = ["2020", "2021", "2022", "2023", "2024", "2025"];

function mutations(base: string): string[] {
  const cap = base.length ? base[0].toUpperCase() + base.slice(1) : base;
  const out = [
    base,
    cap,
    base.toUpperCase(),
    base + "1",
    base + "12",
    base + "123",
    base + "1234",
    base + "!",
    base + "@",
    base + "#",
    cap + "1",
    cap + "123",
    cap + "!",
    cap + "@123",
  ];
  for (const y of YEARS) {
    out.push(base + y);
    out.push(cap + y);
    out.push(base + y + "!");
  }
  return out;
}

const NODE_ALGO: Record<string, string> = {
  MD5: "md5",
  SHA1: "sha1",
  SHA256: "sha256",
  SHA512: "sha512",
};

/** Dictionary + rule-based attack using Node crypto (fast, no PowerShell). */
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
  const sizes: Record<string, number> = {
    "lower+numbers": 36,
    "full-alpha": 62,
    symbols: 46,
  };
  const size = sizes[charset] ?? 36;
  const n = Math.max(1, Math.min(8, Math.floor(maxLength) || 4));
  let combos = 0;
  for (let l = 1; l <= n; l++) combos += size ** l;
  let feasibility: "fast" | "feasible" | "hard" | "infeasible";
  if (combos < 1e6) feasibility = "fast";
  else if (combos < 1e8) feasibility = "feasible";
  else if (combos < 1e10) feasibility = "hard";
  else feasibility = "infeasible";
  return { size, combos, feasibility };
}