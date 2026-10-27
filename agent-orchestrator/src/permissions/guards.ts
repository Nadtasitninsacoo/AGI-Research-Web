import { tokens } from "./shell.js";

const PROTECTED_BRANCH = /^(main|master)$/;

/** `/`, a top-level dir (`/usr`, `/c/`), a drive root, home, `*`, `.` or `..`. */
function isSweepingTarget(arg: string): boolean {
  return (
    /^\/([^/]+\/?)?\*?$/.test(arg) ||
    /^[a-z]:[\\/]?\*?$/i.test(arg) ||
    /^(~|\$HOME|\$\{HOME\})[\\/]?\*?$/.test(arg) ||
    /^\.{1,2}[\\/]?\*?$/.test(arg) ||
    arg === "*"
  );
}

/** `rm -r` / `rm -rf` aimed at a root, home or the whole working tree. */
export function isSweepingRm(segment: string): boolean {
  const t = tokens(segment);
  const i = t[0] === "sudo" ? 1 : 0;
  if (t[i] !== "rm") return false;
  const args = t.slice(i + 1);
  if (args.includes("--no-preserve-root")) return true;
  const recursive = args.some((a) => a === "--recursive" || /^-[a-zA-Z]*[rR]/.test(a));
  return recursive && args.some((a) => !a.startsWith("-") && isSweepingTarget(a));
}

function destination(refspec: string): string {
  return (refspec.replace(/^\+/, "").split(":").pop() ?? "").replace(/^refs\/heads\//, "");
}

/**
 * Classify a history-overwriting `git push` (force, `+ref`, deleting a ref).
 * "protected": it could hit main/master, including when no branch is named
 * (the current branch may be main). "other": a named non-protected branch.
 */
export function classifyForcePush(segment: string): "protected" | "other" | undefined {
  const t = tokens(segment);
  if (t[0] !== "git") return undefined;
  const at = t.indexOf("push");
  if (at < 0) return undefined;
  const args = t.slice(at + 1);
  const flags = args.filter((a) => a.startsWith("-"));
  const refspecs = args.filter((a) => !a.startsWith("-")).slice(1);

  const forced =
    flags.some((f) => f.startsWith("--force") || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(f)) ||
    refspecs.some((r) => r.startsWith("+"));
  const deleting = flags.includes("--delete") || flags.includes("-d") || refspecs.some((r) => r.startsWith(":"));
  // --mirror overwrites and prunes every remote ref, so it is destructive by itself.
  const mirror = flags.includes("--mirror");
  if (!forced && !deleting && !mirror) return undefined;

  if (mirror || flags.includes("--all") || refspecs.length === 0) return "protected";
  return refspecs.some((r) => PROTECTED_BRANCH.test(destination(r))) ? "protected" : "other";
}
