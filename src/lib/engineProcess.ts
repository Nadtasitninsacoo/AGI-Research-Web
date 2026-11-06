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
const PID_PATH = path.join(ROOT, "engine-runtime.pid");

function isPidAlive(pid: number | null): boolean {
  if (!pid || pid <= 0) return false;
  try {
    // Signal 0 is an existence probe — it never actually kills the process.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but we may not signal it — still alive.
    return (err as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

function readPidFile(): number | null {
  try {
    const pid = Number(fs.readFileSync(PID_PATH, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function childAlive(): boolean {
  return state.child != null && state.child.exitCode == null && state.child.signalCode == null && !state.child.killed;
}

// Running if we still hold the spawned child, OR a detached engine from an
// earlier server process is still alive (tracked by its pidfile). Without the
// pidfile fallback a dev-server restart drops the child reference and the engine
// looks "stopped" even though it is still polling — which is the bug this fixes.
function isAlive(): boolean {
  if (childAlive()) return true;
  return isPidAlive(readPidFile());
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
  const live = childAlive();
  return {
    running,
    // When detected via the pidfile (after a server restart) we have the pid but
    // not this process's start time — report the pid, leave uptime unknown.
    pid: running ? (live ? state.pid : readPidFile()) : null,
    startedAt: live ? state.startedAt : null,
    uptimeMs: live && state.startedAt ? Date.now() - state.startedAt : null,
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
      // Detached + unref so the engine is its own process and survives a
      // dev-server restart instead of being torn down with the parent.
      detached: true,
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

  // Record the pid so a restarted server can re-detect this detached engine.
  try {
    if (child.pid) fs.writeFileSync(PID_PATH, String(child.pid));
  } catch {
    /* non-fatal: status just falls back to the live child reference */
  }

  child.on("error", (err) => {
    state.lastError = err.message;
  });
  child.on("exit", (code, signal) => {
    state.lastExit = { code, signal, at: Date.now() };
    state.child = null;
    state.pid = null;
    state.startedAt = null;
    try {
      fs.unlinkSync(PID_PATH);
    } catch {
      /* already gone */
    }
    if (typeof out === "number") {
      try {
        fs.closeSync(out);
      } catch {
        /* already closed */
      }
    }
  });

  // Let the parent exit without waiting on the engine.
  child.unref();

  return { ok: true, message: `เริ่ม engine แล้ว (pid ${child.pid}). log: engine-runtime.log` };
}

export function stopEngine(): { ok: boolean; message: string } {
  // The worker handles SIGTERM/SIGINT with a graceful shutdown (finishes the
  // current tick, then exits).
  if (childAlive() && state.child) {
    state.child.kill("SIGTERM");
    return { ok: true, message: "ส่งสัญญาณหยุด engine แล้ว (จะทำงานที่ค้างให้จบก่อน)" };
  }
  // Detached engine from an earlier server process: stop it by its pidfile.
  const pid = readPidFile();
  if (isPidAlive(pid)) {
    try {
      process.kill(pid as number, "SIGTERM");
    } catch {
      /* already exiting */
    }
    try {
      fs.unlinkSync(PID_PATH);
    } catch {
      /* already gone */
    }
    return { ok: true, message: "ส่งสัญญาณหยุด engine แล้ว (จะทำงานที่ค้างให้จบก่อน)" };
  }
  return { ok: true, message: "engine ไม่ได้ทำงานอยู่" };
}
