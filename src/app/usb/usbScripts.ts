import "server-only";

// Real Password Cracking & Hash Verification Engine (Server-side Helpers)

import { execFile } from "node:child_process";
import { promisify } from "node:util";

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