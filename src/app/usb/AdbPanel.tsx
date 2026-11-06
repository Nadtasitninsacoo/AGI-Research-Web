"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const SERIAL_REGEX = /^[A-Za-z0-9._:-]+$/;

async function executeAdb(args: string[], timeout = 10000): Promise<string> {
  try {
    const { stdout, stderr } = await run("adb", args, {
      timeout,
      windowsHide: true,
      maxBuffer: 4_000_000,
    });
    if (stderr && stderr.trim().length > 0) {
      throw new Error(stderr.trim());
    }
    return stdout.trim();
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === "ENOENT") {
      throw new Error(
        "ไม่พบคำสั่ง adb ในระบบ กรุณาติดตั้ง Android Platform-Tools และเพิ่มลงใน PATH",
      );
    }
    throw new Error(err.message || "การ执行คำสั่ง ADB ล้มเหลว");
  }
}

export type AdbDevice = {
  serial: string;
  state: "device" | "unauthorized" | "offline" | "unknown";
  model: string | null;
};

export type AdbProp = {
  key: string;
  value: string;
};

export async function adbDevices(): Promise<{
  ok: boolean;
  message?: string;
  devices: AdbDevice[];
}> {
  try {
    const output = await executeAdb(["devices", "-l"]);
    const lines = output.split(/\r?\n/).slice(1);
    const devices: AdbDevice[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = /^(\S+)\s+(device|unauthorized|offline)(.*)$/.exec(trimmed);
      if (!match) continue;

      const serial = match[1];
      const state = match[2] as AdbDevice["state"];
      const modelMatch = /model:(\S+)/.exec(match[3] ?? "");

      devices.push({
        serial,
        state,
        model: modelMatch ? modelMatch[1].replace(/_/g, " ") : null,
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
      message: (error as Error).message,
    };
  }
}

export async function adbInfo(
  serial: string,
): Promise<{ ok: boolean; message?: string; props: AdbProp[] }> {
  if (!SERIAL_REGEX.test(serial)) {
    return { ok: false, message: "รูปแบบ Serial Number ไม่ถูกต้อง", props: [] };
  }

  try {
    const output = await executeAdb(["-s", serial, "shell", "getprop"]);
    const props: AdbProp[] = [];
    const want: Record<string, string> = {
      "ro.product.brand": "Brand",
      "ro.product.model": "Model",
      "ro.build.version.release": "Android Version",
      "ro.build.version.sdk": "SDK Version",
      "ro.serialno": "Serial",
    };

    for (const line of output.split(/\r?\n/)) {
      const match = /^\[([^\]]+)\]:\s*\[(.*)\]$/.exec(line.trim());
      if (match && want[match[1]]) {
        props.push({ key: want[match[1]], value: match[2] });
      }
    }

    return { ok: true, props, message: "อ่านข้อมูลอุปกรณ์สำเร็จ" };
  } catch (error: unknown) {
    return { ok: false, message: (error as Error).message, props: [] };
  }
}

export async function adbList(
  serial: string,
  dir: string,
): Promise<{ ok: boolean; message?: string; output: string }> {
  if (!SERIAL_REGEX.test(serial)) {
    return {
      ok: false,
      message: "รูปแบบ Serial Number ไม่ถูกต้อง",
      output: "",
    };
  }

  const safeDir = dir.trim();

  const allowedRoot =
    safeDir === "/sdcard" ||
    safeDir.startsWith("/sdcard/") ||
    safeDir === "/storage/emulated/0" ||
    safeDir.startsWith("/storage/emulated/0/");

  const validPath =
    allowedRoot &&
    !safeDir
      .split("/")
      .some((segment) => segment === "." || segment === "..") &&
    !/[;&|`$<>\\\r\n"'*?()[\]{}!]/.test(safeDir);

  if (!validPath) {
    return {
      ok: false,
      message: "Path ไม่ถูกต้องหรืออยู่นอกพื้นที่จัดเก็บข้อมูลที่อนุญาต",
      output: "",
    };
  }

  try {
    const output = await executeAdb([
      "-s",
      serial,
      "shell",
      "ls",
      "-la",
      safeDir,
    ]);
    return { ok: true, output };
  } catch (error: unknown) {
    return { ok: false, message: (error as Error).message, output: "" };
  }
}
