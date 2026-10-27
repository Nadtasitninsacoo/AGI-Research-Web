import path from "node:path";
import { fileURLToPath } from "node:url";

/** Root of the orchestrator package (agent-orchestrator/). */
export const ORCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Absolute path with forward slashes, so globs and regexes behave the same on every OS. */
export function toPosix(p: string, base: string): string {
  return path.resolve(base, p).replace(/\\/g, "/");
}

/** True when `child` is `root` or inside it. Case-insensitive on Windows. */
export function isInside(child: string, root: string): boolean {
  const norm = (p: string) => {
    const r = path.resolve(p);
    return process.platform === "win32" ? r.toLowerCase() : r;
  };
  const rel = path.relative(norm(root), norm(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
