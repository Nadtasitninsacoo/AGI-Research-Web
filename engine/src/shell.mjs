// Command executor. Runs a command in the chosen shell and returns the REAL
// result — real exit code, real stdout, real stderr. It never fabricates output
// and never forces a success code: the dashboard must show what actually ran.

import { spawn, execFile } from "node:child_process";
import { config } from "./config.mjs";

const SHELLS = {
  powershell: { bin: "powershell.exe", args: (cmd) => ["-NoProfile", "-NonInteractive", "-Command", cmd] },
  cmd: { bin: "cmd.exe", args: (cmd) => ["/d", "/s", "/c", cmd] },
  bash: { bin: "bash", args: (cmd) => ["-lc", cmd] },
  wsl: { bin: "wsl.exe", args: (cmd) => ["-e", "bash", "-lc", cmd] },
};

export const SHELL_NAMES = Object.keys(SHELLS);

export const defaultShell = () => (process.platform === "win32" ? "powershell" : "bash");

// Kill the shell AND everything it started to prevent hung processes.
function killTree(child) {
  if (process.platform === "win32") {
    execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
  } else {
    try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
  }
}

/**
 * @param {object} p
 * @param {string} p.command
 * @param {"powershell"|"cmd"|"bash"|"wsl"} [p.shell]
 * @param {string} [p.cwd]
 * @param {number} [p.timeoutMs]
 * @returns {Promise<{ exitCode:number|null, stdout:string, stderr:string, timedOut:boolean, shell:string }>}
 */
export function runCommand({ command, shell, cwd, timeoutMs }) {
  const name = SHELLS[shell] ? shell : defaultShell();
  const spec = SHELLS[name];
  const limit = timeoutMs ?? config.worker.cmdTimeoutMs;
  const cap = config.worker.maxOutputChars;
  const cmd = String(command ?? "").trim();

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(spec.bin, spec.args(cmd), {
        cwd: cwd ?? config.worker.workdir,
        windowsHide: true,
        detached: process.platform !== "win32",
      });
    } catch (err) {
      // Honest failure: the shell could not be started. Report it as an error,
      // never as a simulated success.
      resolve({
        exitCode: typeof err?.errno === "number" ? err.errno : -1,
        stdout: "",
        stderr: `spawn failed: ${err?.message ?? err}`,
        timedOut: false,
        shell: name,
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let done = false;

    const clip = (buf, chunk) => (buf.length < cap ? (buf + chunk).slice(0, cap) : buf);

    child.stdout.on("data", (d) => { stdout = clip(stdout, d.toString()); });
    child.stderr.on("data", (d) => { stderr = clip(stderr, d.toString()); });

    let grace;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      // If it doesn't die promptly, close it out — but keep the real (null) code.
      grace = setTimeout(() => finish(null), 3_000);
    }, limit);

    const finish = (exitCode, spawnErr) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(grace);
      const note = (s) => (s.length >= cap ? `${s}\n...[truncated at ${cap} chars]` : s);
      resolve({
        // Real exit code, as reported by the OS. null means the process was
        // killed/terminated (e.g. timeout) — we do NOT coerce that to 0.
        exitCode,
        stdout: note(stdout),
        stderr:
          note(stderr) +
          (timedOut ? `\n[timed out after ${limit}ms — process killed]` : "") +
          (spawnErr ? `\n[process error: ${spawnErr}]` : ""),
        timedOut,
        shell: name,
      });
    };

    // A process error (I/O, ENOENT, etc.) is a real failure, not a success.
    child.on("error", (err) => finish(typeof err?.errno === "number" ? err.errno : -1, err?.message ?? String(err)));
    child.on("close", (code) => finish(code));
  });
}
