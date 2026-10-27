import path from "node:path";
import type { HookCallback, PreToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";
import type { PermissionEngine } from "../permissions/engine.js";
import { denyMessage } from "../permissions/messages.js";
import { targetPath } from "../permissions/rules.js";
import type { LockManager } from "./locks.js";

const WRITE_TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);

function deny(reason: string) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse" as const, permissionDecision: "deny" as const, permissionDecisionReason: reason } };
}
function allow() {
  return { hookSpecificOutput: { hookEventName: "PreToolUse" as const, permissionDecision: "allow" as const } };
}

/** The shared policy, with "ask" turned into a deny: jobs run unattended, so nothing can prompt. */
function basePolicy(engine: PermissionEngine, tool: string, input: Record<string, unknown>) {
  const v = engine.decide({ tool, input });
  if (v.decision === "allow") return allow();
  if (v.decision === "deny") return deny(denyMessage(v));
  return deny(`${v.reason} This needs a human and cannot run inside a background job. Report it instead of retrying.`);
}

/** Read-only job hook: the shared policy only (reads allowed, secrets denied). */
export function createExploreHook(engine: PermissionEngine): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const { tool_name, tool_input } = input as PreToolUseHookInput;
    return basePolicy(engine, tool_name, (tool_input ?? {}) as Record<string, unknown>);
  };
}

/**
 * Worker job hook: the shared policy, plus write confinement. A write must land
 * inside the brief's allowedPaths and acquire the file's cross-job lock; anything
 * else is denied so a worker can only touch what it was told to.
 */
export function createWorkerHook(engine: PermissionEngine, jobId: string, allowedPaths: string[], locks: LockManager, repo: string): HookCallback {
  const matches = (rel: string) => allowedPaths.some((g) => path.posix.matchesGlob(rel, g) || rel === g || rel.startsWith(g.replace(/\/$/, "") + "/"));
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const { tool_name, tool_input } = input as PreToolUseHookInput;
    const toolInput = (tool_input ?? {}) as Record<string, unknown>;
    const base = basePolicy(engine, tool_name, toolInput);
    if (base.hookSpecificOutput.permissionDecision === "deny" || !WRITE_TOOLS.has(tool_name)) return base;

    const abs = targetPath({ tool: tool_name, input: toolInput }, repo);
    if (!abs) return deny("This edit has no resolvable target path.");
    const rel = path.relative(repo, abs).replace(/\\/g, "/");
    if (rel.startsWith("..") || path.isAbsolute(rel)) return deny("Workers may only edit files inside the repository.");
    if (!matches(rel)) return deny(`"${rel}" is outside your allowed paths (${allowedPaths.join(", ")}). Stay within the brief.`);

    const lock = locks.acquire(jobId, abs);
    if (!lock.ok) return deny(`"${rel}" is locked by job ${lock.heldBy}. Do not edit it; another worker holds it.`);
    return allow();
  };
}
