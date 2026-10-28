"use server";

// USB Lab — local, read-only hardware recon for devices you own and have
// physically plugged in. Everything here ENUMERATES: it never writes to a
// device, flashes firmware, or changes system state. Commands are fixed
// templates run with execFile (argument arrays, no shell string), and the one
// piece of user input that reaches a command (a PnP instance id) is strictly
// validated before it is embedded.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const WIN = process.platform === "win32";
const MAXBUF = 6_000_000;

async function ps(script: string, timeout = 15000): Promise<string> {
  const { stdout } = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    timeout,
    windowsHide: true,
    maxBuffer: MAXBUF,
  });
  return stdout;
}

async function wsl(cmd: string, timeout = 15000): Promise<string> {
  const { stdout } = await run("wsl.exe", ["-e", "bash", "-lc", cmd], { timeout, windowsHide: true, maxBuffer: MAXBUF });
  return stdout;
}

/** Normalize ConvertTo-Json output (object when single, array when many). */
function asArray<T>(parsed: unknown): T[] {
  if (Array.isArray(parsed)) return parsed as T[];
  if (parsed && typeof parsed === "object") return [parsed as T];
  return [];
}

const vidpidOf = (id: string): string | null => {
  const m = /VID_([0-9A-Fa-f]{4})&PID_([0-9A-Fa-f]{4})/.exec(id);
  return m ? `${m[1].toUpperCase()}:${m[2].toUpperCase()}` : null;
};

export type UsbDevice = {
  name: string;
  vidpid: string | null;
  cls: string | null;
  service: string | null;
  status: string | null;
  instanceId: string;
  busid: string | null; // from usbipd — needed to attach into WSL
  attached: boolean; // usbipd: currently shared to a WSL client
};

type PnpRow = { name?: string; id?: string; class?: string; service?: string; status?: string };
type UsbipdDev = { BusId?: string; InstanceId?: string; ClientIPAddress?: string | null; IsForced?: boolean };

/** Enumerate plugged-in USB devices (Windows PnP), merged with usbipd bus ids. */
export async function usbScan(): Promise<{ ok: boolean; message?: string; usbipd: boolean; devices: UsbDevice[] }> {
  if (!WIN) {
    // Non-Windows fallback: lsusb only.
    try {
      const out = await wsl("command -v lsusb >/dev/null 2>&1 && lsusb || echo __NO_LSUSB__");
      return { ok: true, usbipd: false, devices: [], message: out.includes("__NO_LSUSB__") ? "ติดตั้ง usbutils ก่อน (lsusb)" : out };
    } catch {
      return { ok: false, usbipd: false, devices: [], message: "ระบบนี้ไม่ใช่ Windows และไม่มี lsusb" };
    }
  }

  const script = `
$ErrorActionPreference='SilentlyContinue'
Get-CimInstance Win32_PnPEntity |
  Where-Object { $_.PNPDeviceID -like 'USB\\*' } |
  ForEach-Object { [pscustomobject]@{ name=$_.Name; id=$_.PNPDeviceID; class=$_.PNPClass; service=$_.Service; status=$_.Status } } |
  ConvertTo-Json -Depth 3 -Compress`;

  let pnp: PnpRow[] = [];
  try {
    const out = (await ps(script)).trim();
    pnp = out ? asArray<PnpRow>(JSON.parse(out)) : [];
  } catch (e) {
    return { ok: false, usbipd: false, devices: [], message: `อ่านอุปกรณ์ USB ไม่สำเร็จ: ${(e as Error).message}` };
  }

  // usbipd (optional) — gives the bus id used to attach a device into WSL/Kali.
  const byInstance = new Map<string, UsbipdDev>();
  let usbipd = false;
  try {
    const out = (await ps("usbipd state", 8000)).trim();
    usbipd = true;
    const devs = asArray<UsbipdDev>((JSON.parse(out) as { Devices?: UsbipdDev[] }).Devices ?? []);
    for (const d of devs) if (d.InstanceId) byInstance.set(d.InstanceId.toUpperCase(), d);
  } catch {
    usbipd = false;
  }

  const devices: UsbDevice[] = pnp
    .filter((r) => r.id && !/hub|host controller/i.test(r.name ?? ""))
    .map((r) => {
      const id = String(r.id);
      const u = byInstance.get(id.toUpperCase());
      return {
        name: (r.name || "(ไม่ทราบชื่อ)").trim(),
        vidpid: vidpidOf(id),
        cls: r.class ?? null,
        service: r.service ?? null,
        status: r.status ?? null,
        instanceId: id,
        busid: u?.BusId ?? null,
        attached: Boolean(u?.ClientIPAddress),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ok: true, usbipd, devices };
}

// PnP instance ids look like: USB\VID_1234&PID_5678\6&1a2b3c&0&2  — letters,
// digits and \ & . - _ { }. Anything else (quotes, $, ;, backtick, spaces,
// newlines) is rejected so the id can be safely single-quoted into a script.
const SAFE_ID = /^USB\\[A-Za-z0-9&._\\{}-]+$/;

export type UsbProp = { key: string; value: string };

/** Deep PnP inspection of one device: descriptors, hardware/compatible ids, driver. */
export async function usbInspect(instanceId: string): Promise<{ ok: boolean; message?: string; props: UsbProp[] }> {
  if (!WIN) return { ok: false, props: [], message: "รองรับเฉพาะ Windows" };
  const id = String(instanceId).trim();
  if (!SAFE_ID.test(id)) return { ok: false, props: [], message: "instance id ไม่ถูกต้อง" };

  // Some devices (e.g. composite children, MI_xx) make Get-PnpDeviceProperty
  // throw a terminating error, which would exit PowerShell non-zero and reject
  // execFile. Wrap in try/catch, seed with the always-available Get-PnpDevice
  // fields, and force exit 0 so a partial read still returns what we have.
  const script = `
$ErrorActionPreference='SilentlyContinue'
$id='${id}'
$out = New-Object System.Collections.ArrayList
try {
  $d = Get-PnpDevice -InstanceId $id -ErrorAction SilentlyContinue
  if ($d) {
    foreach ($f in 'FriendlyName','Class','Service','Manufacturer','Status') {
      $val = [string]$d.$f
      if ($val -ne '') { [void]$out.Add([pscustomobject]@{ key=$f; value=$val }) }
    }
  }
  $props = Get-PnpDeviceProperty -InstanceId $id -ErrorAction SilentlyContinue
  foreach ($p in $props) {
    $v = [string]($p.Data -join ', ')
    if ($v -ne '') { [void]$out.Add([pscustomobject]@{ key=$p.KeyName; value=$v }) }
  }
} catch {}
$out | ConvertTo-Json -Depth 3 -Compress
exit 0`;

  try {
    const out = (await ps(script)).trim();
    const rows = out ? asArray<UsbProp>(JSON.parse(out)) : [];
    // Surface the interesting descriptors first, then the rest.
    const KEY = /BusReportedDeviceDesc|HardwareIds|CompatibleIds|DriverVersion|LocationInfo|Manufacturer|Class|Service|DeviceDesc/i;
    const hot = rows.filter((r) => KEY.test(r.key));
    const rest = rows.filter((r) => !KEY.test(r.key));
    return { ok: true, props: [...hot, ...rest].slice(0, 120) };
  } catch (e) {
    return { ok: false, props: [], message: `อ่านรายละเอียดไม่สำเร็จ: ${(e as Error).message}` };
  }
}

/** Probe for devices sitting in a DFU / firmware-bootloader mode (dfu-util -l). */
export async function dfuList(): Promise<{ ok: boolean; found: boolean; output: string }> {
  const chunks: string[] = [];
  let found = false;
  // WSL / Kila side first (dfu-util usually lives there).
  try {
    const out = await wsl('command -v dfu-util >/dev/null 2>&1 && dfu-util -l 2>&1 || echo __NO_DFU_WSL__');
    if (out.includes("__NO_DFU_WSL__")) chunks.push("[WSL] ไม่มี dfu-util (ติดตั้ง: sudo apt install dfu-util)");
    else { chunks.push("[WSL dfu-util -l]\n" + out.trim()); if (/Found (DFU|Runtime)/i.test(out)) found = true; }
  } catch {
    chunks.push("[WSL] เรียกไม่ได้ (ไม่มี WSL หรือ distro)");
  }
  // Native Windows dfu-util, if on PATH.
  if (WIN) {
    try {
      const out = await ps("if (Get-Command dfu-util -ErrorAction SilentlyContinue) { dfu-util -l } else { '__NO_DFU_WIN__' }");
      if (!out.includes("__NO_DFU_WIN__")) { chunks.push("[Windows dfu-util -l]\n" + out.trim()); if (/Found (DFU|Runtime)/i.test(out)) found = true; }
    } catch { /* ignore */ }
  }
  return { ok: true, found, output: chunks.join("\n\n") || "ไม่มีผลลัพธ์" };
}

/** List USB as seen from inside WSL (after you attach a device with usbipd). */
export async function wslLsusb(): Promise<{ ok: boolean; output: string }> {
  try {
    const out = await wsl('command -v lsusb >/dev/null 2>&1 && lsusb 2>&1 || echo __NO_LSUSB__');
    if (out.includes("__NO_LSUSB__")) return { ok: false, output: "WSL ไม่มี lsusb — ติดตั้ง: sudo apt install usbutils" };
    return { ok: true, output: out.trim() || "ไม่เห็นอุปกรณ์ (ยัง attach เข้า WSL หรือยัง?)" };
  } catch {
    return { ok: false, output: "เรียก WSL ไม่ได้ (ยังไม่ได้ติดตั้ง WSL?)" };
  }
}
