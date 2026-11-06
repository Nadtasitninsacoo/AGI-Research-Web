import "server-only";

// Real Password Cracking & Hash Verification Engine (Server-side Helpers)

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
export const IS_WINDOWS = process.platform === "win32";
const MAX_BUFFER = 10_000_000;

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
 * สร้างสคริปต์ PowerShell สำหรับการตรวจสอบแฮชและประมวลผลการแครกจริง 
 * โดยใช้ .NET Cryptography ในการคำนวณ Hash เทียบเคียงกับ Target Hash
 */
export async function executeRealCrackingJob(
  targetHash: string,
  algorithm: string = "SHA256",
  charsetType: string = "lower+numbers",
  maxLength = 4,
  timeout = 60_000
): Promise<string> {
  const safeHash = targetHash.replace(/'/g, "''").trim();
  const safeAlgo = algorithm.toUpperCase();

  // ชุดคำสั่ง PowerShell ที่ทำการตรวจสอบแฮชจริงด้วย .NET
  const realCrackingScript = `
$ErrorActionPreference = 'Stop'
$TargetHash = '${safeHash}'
$Algorithm = '${safeAlgo}'
$CharsetType = '${charsetType}'
$MaxLength = ${maxLength}

# กำหนดชุดตัวอักษรตามที่เลือก
$chars = switch ($CharsetType) {
    'lower+numbers' { 'abcdefghijklmnopqrstuvwxyz0123456789'.ToCharArray() }
    'full-alpha'    { 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.ToCharArray() }
    default         { 'abcdefghijklmnopqrstuvwxyz0123456789'.ToCharArray() }
}

$found = $false
$recoveredPassword = $null
$attempts = 0
$startTime = Get-Date

function Test-HashMatch {
    param([string]$password)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($password)
    
    $hashObj = switch ($Algorithm) {
        'MD5'    { [System.Security.Cryptography.MD5]::Create() }
        'SHA1'   { [System.Security.Cryptography.SHA1]::Create() }
        'SHA256' { [System.Security.Cryptography.SHA256]::Create() }
        'SHA512' { [System.Security.Cryptography.SHA512]::Create() }
        default  { [System.Security.Cryptography.SHA256]::Create() }
    }

    $hashBytes = $hashObj.ComputeHash($bytes)
    $hashString = [BitConverter]::ToString($hashBytes) -replace '-'
    if ($hashObj -is [IDisposable]) { $hashObj.Dispose() }

    return $hashString -eq $TargetHash
}

# ฟังก์ชันRecursive สำหรับการทดสอบรหัสผ่านแบบ Brute-force ตามความยาวสูงสุด
function Invoke-BruteForce {
    param([char[]]$current, [int]$index)
    script:attempts++

    if ($index -eq 0) {
        $candidate = -join $current
        if (Test-HashMatch -password $candidate) {
            script:found = $true
            script:recoveredPassword = $candidate
        }
        return
    }

    foreach ($c in $chars) {
        if (script:found) { return }
        $current[$MaxLength - $index] = $c
        Invoke-BruteForce -current $current -index ($index - 1)
    }
}

for ($len = 1; $len -le $MaxLength; $len++) {
    if ($found) { break }
    $buffer = New-Object char[] $len
    Invoke-BruteForce -current $buffer -index $len
}

$endTime = Get-Date
$duration = ($endTime - $startTime).TotalSeconds

[pscustomobject]@{
    TargetHash = $TargetHash
    Success = $found
    RecoveredPassword = $recoveredPassword
    TotalAttempts = $attempts
    DurationSeconds = $duration
} | ConvertTo-Json -Depth 4 -Compress
  `;

  const { stdout } = await run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", realCrackingScript],
    {
      timeout,
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
  if (!output.trim()) return [];

  return asArray<T>(JSON.parse(output) as unknown);
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

/** แปลงข้อมูลผลลัพธ์จากการตรวจสอบแฮชจริงให้อยู่ในโครงสร้างข้อมูล */
export function parseCrackingOutput(output: string): CrackingTargetResult[] {
  const rows = parseJson<CrackingRow>(output);

  return rows.map((row) => ({
    hash: row.TargetHash ?? "Unknown",
    success: !!row.Success,
    password: row.RecoveredPassword ?? null,
    attempts: row.TotalAttempts ?? 0,
    duration: row.DurationSeconds ?? 0,
  }));
}