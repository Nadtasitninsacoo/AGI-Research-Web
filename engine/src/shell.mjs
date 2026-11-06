
import { spawn, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { config } from "./config.mjs";

const SHELLS = {
  powershell: {
    bin: "powershell.exe",
    args: (cmd) => [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      cmd,
    ],
  },
  cmd: {
    bin: "cmd.exe",
    args: (cmd) => ["/d", "/s", "/c", cmd],
  },
  bash: {
    bin: "bash",
    args: (cmd) => ["-lc", cmd],
  },
  wsl: {
    bin: "wsl.exe",
    args: (cmd) => ["-e", "bash", "-lc", cmd],
  },
};

export const SHELL_NAMES = Object.keys(SHELLS);

export const defaultShell = () =>
  process.platform === "win32" ? "powershell" : "bash";

function killTree(child) {
  if (!child?.pid || child.killed) return;

  if (process.platform === "win32") {
    execFile(
      "taskkill",
      ["/pid", String(child.pid), "/T", "/F"],
      { windowsHide: true },
      () => {}
    );
    return;
  }

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // Process may already have exited.
    }
  }
}

/**
 * Execute a system command.
 *
 * @param {object} p
 * @param {string} p.command
 * @param {"powershell"|"cmd"|"bash"|"wsl"} [p.shell]
 * @param {string} [p.cwd]
 * @param {number} [p.timeoutMs]
 * @returns {Promise<{
 *   exitCode:number|null,
 *   stdout:string,
 *   stderr:string,
 *   timedOut:boolean,
 *   shell:string
 * }>}
 */
export function runCommand({
  command,
  shell,
  cwd,
  timeoutMs,
}) {
  const name = SHELLS[shell] ? shell : defaultShell();
  const spec = SHELLS[name];

  const configuredTimeout = config.worker.cmdTimeoutMs;
  const limit =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : configuredTimeout;

  const configuredCap = config.worker.maxOutputChars;
  const cap =
    Number.isFinite(configuredCap) && configuredCap > 0
      ? configuredCap
      : 50_000;

  const cmd = String(command ?? "").trim();

  if (!cmd) {
    return Promise.resolve({
      exitCode: 1,
      stdout: "",
      stderr: "Command is empty.",
      timedOut: false,
      shell: name,
    });
  }

  const workdir = cwd ?? config.worker.workdir;

  if (workdir && !existsSync(workdir)) {
    return Promise.resolve({
      exitCode: 1,
      stdout: "",
      stderr: `Working directory does not exist: ${workdir}`,
      timedOut: false,
      shell: name,
    });
  }

  return new Promise((resolve) => {
    let child;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let done = false;
    let timer;
    let grace;

    const clip = (current, chunk) => {
      if (current.length >= cap) return current;
      return (current + chunk).slice(0, cap);
    };

    const finish = (exitCode) => {
      if (done) return;

      done = true;

      if (timer) clearTimeout(timer);
      if (grace) clearTimeout(grace);

      const finalCode =
        typeof exitCode === "number"
          ? exitCode
          : timedOut
            ? 124
            : 1;

      const outputNote = (value) =>
        value.length >= cap
          ? `${value}\n...[truncated at ${cap} chars]`
          : value;

      resolve({
        exitCode: finalCode,
        stdout: outputNote(stdout),
        stderr:
          outputNote(stderr) +
          (timedOut
            ? `\n[Execution terminated: timeout threshold reached (${limit}ms)]`
            : ""),
        timedOut,
        shell: name,
      });
    };

    try {
      child = spawn(spec.bin, spec.args(cmd), {
        cwd: workdir,
        env: { ...process.env },
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      stderr = `Failed to spawn shell: ${err?.message ?? String(err)}`;
      finish(1);
      return;
    }

    child.stdout?.on("data", (data) => {
      stdout = clip(stdout, data.toString());
    });

    child.stderr?.on("data", (data) => {
      stderr = clip(stderr, data.toString());
    });

    timer = setTimeout(() => {
      if (done) return;

      timedOut = true;
      killTree(child);

      grace = setTimeout(() => {
        finish(124);
      }, 2_000);
    }, limit);

    child.on("error", (err) => {
      stderr = clip(
        stderr,
        `\nProcess error: ${err?.message ?? String(err)}`
      );

      finish(1);
    });

    child.on("close", (code) => {
      finish(code);
    });
  });
}
