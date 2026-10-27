// Command executor.
//
// Runs a command in a chosen shell and captures stdout/stderr/exit code with a
// hard timeout. The command is passed as a single argument (no `shell: true`)
// so we invoke exactly the one interpreter we intend.
//
// Supported shells:
//   powershell  Windows PowerShell          (default on win32)
//   cmd         Windows command prompt
//   bash        bash on PATH (Git Bash / native)
//   wsl         bash inside WSL — the usual way to reach Kali/Linux tooling
import { spawn } from "node:child_process";
import { config } from "./config.mjs";

const SHELLS = {
  powershell: { bin: "powershell.exe", args: (cmd) => ["-NoProfile", "-NonInteractive", "-Command", cmd] },
  cmd: { bin: "cmd.exe", args: (cmd) => ["/d", "/s", "/c", cmd] },
  bash: { bin: "bash", args: (cmd) => ["-lc", cmd] },
  wsl: { bin: "wsl.exe", args: (cmd) => ["-e", "bash", "-lc", cmd] },
};

export const SHELL_NAMES = Object.keys(SHELLS);

export const defaultShell = () => (process.platform === "win32" ? "powershell" : "bash");

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

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(spec.bin, spec.args(command), {
        cwd: cwd ?? config.worker.workdir,
        windowsHide: true,
      });
    } catch (err) {
      resolve({ exitCode: null, stdout: "", stderr: `failed to launch ${spec.bin}: ${err?.message ?? err}`, timedOut: false, shell: name });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let done = false;

    const clip = (buf, chunk) => (buf.length < cap ? buf + chunk : buf);

    child.stdout.on("data", (d) => { stdout = clip(stdout, d.toString()); });
    child.stderr.on("data", (d) => { stderr = clip(stderr, d.toString()); });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, limit);

    const finish = (exitCode) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const note = (s) => (s.length >= cap ? `${s}\n...[truncated at ${cap} chars]` : s);
      resolve({
        exitCode,
        stdout: note(stdout),
        stderr: note(stderr) + (timedOut ? `\n...[killed after ${limit}ms timeout]` : ""),
        timedOut,
        shell: name,
      });
    };

    child.on("error", (err) => { stderr = clip(stderr, `\nspawn error: ${err?.message ?? err}`); finish(null); });
    child.on("close", (code) => finish(code));
  });
}
