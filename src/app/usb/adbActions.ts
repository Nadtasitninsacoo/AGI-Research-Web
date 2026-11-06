
"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const SERIAL_REGEX = /^[A-Za-z0-9._:-]+$/;
const ADB_TIMEOUT = 15_000;
const MAX_BUFFER = 4_000_000;

const ADB_MISSING =
  "ไม่พบคำสั่ง adb — กรุณาติดตั้ง Android Platform-Tools และเพิ่มลงใน PATH";

const errMsg = (error: unknown): string => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  ) {
    return ADB_MISSING;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "คำสั่ง ADB ล้มเหลว";
};

async function adb(
  args: string[],
  timeout = ADB_TIMEOUT,
): Promise<string> {
  try {
    const { stdout } = await run("adb", args, {
      timeout,
      windowsHide: true,
      maxBuffer: MAX_BUFFER,
    });

    return stdout.trim();
  } catch (error: unknown) {
    throw new Error(errMsg(error));
  }
}

function isValidSerial(serial: string): boolean {
  return SERIAL_REGEX.test(serial);
}

export type AdbDevice = {
  serial: string;
  state: "device" | "unauthorized" | "offline";
  model: string | null;
};

export type AdbProp = {
  key: string;
  value: string;
};

export type AdbResult<T> = {
  ok: boolean;
  message?: string;
} & T;

/**
 * ตรวจสอบและแสดงรายการอุปกรณ์จริงจาก ADB
 */
export async function adbDevices(): Promise<
  AdbResult<{ devices: AdbDevice[] }>
> {
  try {
    const output = await adb(["devices", "-l"]);
    const lines = output.split(/\r?\n/).slice(1);

    const devices: AdbDevice[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) continue;

      const match =
        /^(\S+)\s+(device|unauthorized|offline)(.*)$/.exec(trimmed);

      if (!match) continue;

      const serial = match[1];
      const state = match[2] as AdbDevice["state"];
      const details = match[3] ?? "";

      const modelMatch = /(?:^|\s)model:(\S+)/.exec(details);

      devices.push({
        serial,
        state,
        model: modelMatch
          ? modelMatch[1].replace(/_/g, " ")
          : null,
      });
    }

    return {
      ok: true,
      devices,
      message:
        devices.length > 0
          ? `ตรวจพบอุปกรณ์จริง ${devices.length} เครื่อง`
          : "ไม่พบอุปกรณ์เชื่อมต่อผ่าน ADB",
    };
  } catch (error: unknown) {
    return {
      ok: false,
      devices: [],
      message: errMsg(error),
    };
  }
}

/**
 * ตรวจสอบว่าอุปกรณ์พร้อมใช้งานผ่าน ADB หรือไม่
 */
export async function adbCheckReady(
  serial: string,
): Promise<{ ok: boolean; message: string }> {
  if (!isValidSerial(serial)) {
    return {
      ok: false,
      message: "Serial number ไม่ถูกต้อง",
    };
  }

  try {
    const state = await adb(["-s", serial, "get-state"]);

    if (state !== "device") {
      return {
        ok: false,
        message: `อุปกรณ์ยังไม่พร้อมใช้งาน: ${state}`,
      };
    }

    return {
      ok: true,
      message: "ADB เชื่อมต่อกับอุปกรณ์แล้ว",
    };
  } catch (error: unknown) {
    return {
      ok: false,
      message: errMsg(error),
    };
  }
}

/**
 * อ่านข้อมูล System Properties จากอุปกรณ์จริง
 */
export async function adbInfo(
  serial: string,
): Promise<AdbResult<{ props: AdbProp[] }>> {
  if (!isValidSerial(serial)) {
    return {
      ok: false,
      props: [],
      message: "Serial number ไม่ถูกต้อง",
    };
  }

  try {
    const ready = await adbCheckReady(serial);

    if (!ready.ok) {
      return {
        ok: false,
        props: [],
        message: ready.message,
      };
    }

    const output = await adb([
      "-s",
      serial,
      "shell",
      "getprop",
    ]);

    const wanted: Record<string, string> = {
      "ro.product.brand": "ยี่ห้อ",
      "ro.product.model": "รุ่น",
      "ro.product.device": "Device",
      "ro.build.version.release": "Android",
      "ro.build.version.sdk": "SDK",
      "ro.serialno": "Serial",
      "ro.boot.bootloader": "Bootloader",
      "ro.product.cpu.abi": "CPU ABI",
    };

    const props: AdbProp[] = [];

    for (const line of output.split(/\r?\n/)) {
      const match =
        /^\[([^\]]+)\]:\s*\[(.*)\]$/.exec(line.trim());

      if (!match) continue;

      const label = wanted[match[1]];

      if (label) {
        props.push({
          key: label,
          value: match[2],
        });
      }
    }

    if (props.length === 0) {
      return {
        ok: false,
        props: [],
        message: "ไม่พบ System Properties ที่ต้องการ",
      };
    }

    return {
      ok: true,
      props,
      message: "อ่านข้อมูลอุปกรณ์สำเร็จ",
    };
  } catch (error: unknown) {
    return {
      ok: false,
      props: [],
      message: errMsg(error),
    };
  }
}

/**
 * ตรวจสอบ Path ที่อนุญาตให้อ่านได้
 */
function isAllowedStoragePath(path: string): boolean {
  const normalized = path.trim();

  const allowedRoot =
    normalized === "/sdcard" ||
    normalized.startsWith("/sdcard/") ||
    normalized === "/storage/emulated/0" ||
    normalized.startsWith("/storage/emulated/0/");

  if (!allowedRoot) return false;

  const segments = normalized.split("/");

  if (
    segments.some(
      (segment) => segment === "." || segment === "..",
    )
  ) {
    return false;
  }

  if (/[;&|`$<>\\\r\n"'*?()[\]{}!]/.test(normalized)) {
    return false;
  }

  return true;
}

/**
 * แสดงรายการไฟล์ในพื้นที่จัดเก็บข้อมูลที่อนุญาต
 */
export async function adbList(
  serial: string,
  dir: string,
): Promise<AdbResult<{ output: string }>> {
  if (!isValidSerial(serial)) {
    return {
      ok: false,
      output: "",
      message: "Serial number ไม่ถูกต้อง",
    };
  }

  const targetDir = dir.trim() || "/sdcard";

  if (!isAllowedStoragePath(targetDir)) {
    return {
      ok: false,
      output: "",
      message:
        "อนุญาตเฉพาะ /sdcard และ /storage/emulated/0 เท่านั้น",
    };
  }

  try {
    const ready = await adbCheckReady(serial);

    if (!ready.ok) {
      return {
        ok: false,
        output: "",
        message: ready.message,
      };
    }

    const output = await adb([
      "-s",
      serial,
      "shell",
      "ls",
      "-la",
      targetDir,
    ]);

    return {
      ok: true,
      output,
      message: "อ่านรายการไฟล์สำเร็จ",
    };
  } catch (error: unknown) {
    return {
      ok: false,
      output: "",
      message: errMsg(error),
    };
  }
}
