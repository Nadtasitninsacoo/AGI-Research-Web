"use server";

// ADB bridge — pull data off YOUR OWN phone over USB. Every capability here
// depends on consent that lives in the protocol itself: the phone must have USB
// debugging enabled and must show "device" (not "unauthorized") after you tap
// Allow on its screen. This does NOT and will NOT bypass a lock screen; it only
// talks to a phone that has already authorized this computer. All commands are
// read-only (devices / getprop / ls) and run via execFile arg arrays.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const SERIAL = /^[A-Za-z0-9._:-]+$/;
const DIROK = /^\/[A-Za-z0-9._\-/ ]*$/;

async function adb(args: string[], timeout = 15000): Promise<string> {
  const { stdout } = await run("adb", args, { timeout, windowsHide: true, maxBuffer: 4_000_000 });
  return stdout;
}

const noAdb = (e: unknown) => (e as { code?: string })?.code === "ENOENT";
const ADB_MISSING = "ไม่พบ adb ใน PATH — ติดตั้ง Android platform-tools ก่อน";

export type AdbDevice = { serial: string; state: string; model: string | null };

/** List attached devices + their auth state (device / unauthorized / offline). */
export async function adbDevices(): Promise<{ ok: boolean; message?: string; devices: AdbDevice[] }> {
  try {
    const out = await adb(["devices", "-l"]);
    const devices: AdbDevice[] = [];
    for (const line of out.split(/\r?\n/).slice(1)) {
      const m = /^(\S+)\s+(\S+)(.*)$/.exec(line.trim());
      if (!m) continue;
      const model = /model:(\S+)/.exec(m[3] ?? "");
      devices.push({ serial: m[1], state: m[2], model: model ? model[1].replace(/_/g, " ") : null });
    }
    return { ok: true, devices };
  } catch (e) {
    return { ok: false, devices: [], message: noAdb(e) ? ADB_MISSING : `เรียก adb ไม่สำเร็จ: ${(e as Error).message}` };
  }
}

export type AdbProp = { key: string; value: string };

/** A small, useful slice of getprop (brand, model, Android version, storage). */
export async function adbInfo(serial: string): Promise<{ ok: boolean; message?: string; props: AdbProp[] }> {
  if (!SERIAL.test(serial)) return { ok: false, props: [], message: "serial ไม่ถูกต้อง" };
  try {
    const out = await adb(["-s", serial, "shell", "getprop"]);
    const want: Record<string, string> = {
      "ro.product.brand": "ยี่ห้อ", "ro.product.model": "รุ่น", "ro.product.device": "device",
      "ro.build.version.release": "Android", "ro.build.version.sdk": "SDK", "ro.serialno": "serial",
      "ro.boot.bootloader": "bootloader", "ro.product.cpu.abi": "ABI",
    };
    const props: AdbProp[] = [];
    for (const line of out.split(/\r?\n/)) {
      const m = /^\[([^\]]+)\]:\s*\[(.*)\]$/.exec(line.trim());
      if (m && want[m[1]]) props.push({ key: want[m[1]], value: m[2] });
    }
    return { ok: true, props };
  } catch (e) {
    return { ok: false, props: [], message: noAdb(e) ? ADB_MISSING : `อ่านข้อมูลไม่สำเร็จ: ${(e as Error).message}` };
  }
}

/** Browse a directory on the device (read-only ls). Default /sdcard/. */
export async function adbList(serial: string, dir: string): Promise<{ ok: boolean; message?: string; output: string }> {
  if (!SERIAL.test(serial)) return { ok: false, output: "", message: "serial ไม่ถูกต้อง" };
  const d = dir.trim() || "/sdcard/";
  if (!DIROK.test(d)) return { ok: false, output: "", message: "path ต้องขึ้นต้นด้วย / และเป็นอักขระปลอดภัย" };
  try {
    const out = await adb(["-s", serial, "shell", "ls", "-la", d]);
    return { ok: true, output: out.trim() || "(ว่าง)" };
  } catch (e) {
    return { ok: false, output: "", message: noAdb(e) ? ADB_MISSING : `ls ไม่สำเร็จ (ปลดล็อก + authorize เครื่องหรือยัง?)` };
  }
}
