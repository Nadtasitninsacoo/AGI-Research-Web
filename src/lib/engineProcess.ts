// Server-side manager for the engine worker child process, so the dashboard
// can start/stop `node --env-file=.env.local engine/src/index.mjs` with a button
// instead of a terminal. The child is tracked in a globalThis singleton so it
// survives dev HMR module reloads (but NOT a full server restart).
//
// Local admin convenience only. It spawns a FIXED command (no user input), and
// the worker it launches still enforces scope.mjs + policy.mjs on every action.
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type EngineState = {
  child: ChildProcess | null;
  pid: number | null;
  startedAt: number | null;
  lastExit: { code: number | null; signal: string | null; at: number } | null;
  lastError: string | null;
};

const g = globalThis as unknown as { __engineProc?: EngineState };
const state: EngineState =
  g.__engineProc ?? (g.__engineProc = { child: null, pid: null, startedAt: null, lastExit: null, lastError: null });

const ROOT = process.cwd();
const LOG_PATH = path.join(ROOT, "engine-runtime.log");

function isAlive(): boolean {
  return state.child != null && state.child.exitCode == null && state.child.signalCode == null && !state.child.killed;
}

export type EngineStatus = {
  running: boolean;
  pid: number | null;
  startedAt: number | null;
  uptimeMs: number | null;
  lastExit: EngineState["lastExit"];
  lastError: string | null;
};

export function engineStatus(): EngineStatus {
  const running = isAlive();
  return {
    running,
    pid: running ? state.pid : null,
    startedAt: running ? state.startedAt : null,
    uptimeMs: running && state.startedAt ? Date.now() - state.startedAt : null,
    lastExit: state.lastExit,
    lastError: state.lastError,
  };
}

export function startEngine(): { ok: boolean; message: string; already?: boolean } {
  if (isAlive()) return { ok: true, message: `Engine กำลังทำงานอยู่แล้ว (pid ${state.pid}).`, already: true };

  let out: number | "ignore" = "ignore";
  try {
    out = fs.openSync(LOG_PATH, "a");
  } catch {
    out = "ignore";
  }

  let child: ChildProcess;
  try {
    child = spawn(process.execPath, ["--env-file=.env.local", "engine/src/index.mjs"], {
      cwd: ROOT,
      stdio: ["ignore", out, out],
      windowsHide: true,
    });
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `เปิด engine ไม่สำเร็จ: ${state.lastError}` };
  }

  state.child = child;
  state.pid = child.pid ?? null;
  state.startedAt = Date.now();
  state.lastExit = null;
  state.lastError = null;

  child.on("error", (err) => {
    state.lastError = err.message;
  });
  child.on("exit", (code, signal) => {
    state.lastExit = { code, signal, at: Date.now() };
    state.child = null;
    state.pid = null;
    state.startedAt = null;
    if (typeof out === "number") {
      try {
        fs.closeSync(out);
      } catch {
        /* already closed */
      }
    }
  });

  return { ok: true, message: `เริ่ม engine แล้ว (pid ${child.pid}). log: engine-runtime.log` };
}

export function stopEngine(): { ok: boolean; message: string } {
  if (!isAlive() || !state.child) return { ok: true, message: "engine ไม่ได้ทำงานอยู่" };
  // The worker handles SIGTERM/SIGINT with a graceful shutdown (finishes the
  // current tick, then exits).
  state.child.kill("SIGTERM");
  return { ok: true, message: "ส่งสัญญาณหยุด engine แล้ว (จะทำงานที่ค้างให้จบก่อน)" };
}
