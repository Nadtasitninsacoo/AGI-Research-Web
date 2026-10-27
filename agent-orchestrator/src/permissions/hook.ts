import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import type { AuditLog } from "./audit.js";
import type { PermissionEngine } from "./engine.js";
import { denyMessage } from "./messages.js";

/**
 * PreToolUse hook: runs on every tool call (canUseTool only fires on "ask").
 * allow/deny are final here; "ask" hands the call to canUseTool, which asks the user.
 */
export function createPermissionHook(engine: PermissionEngine, audit: AuditLog): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const call = { tool: input.tool_name, input: (input.tool_input ?? {}) as Record<string, unknown> };
    const v = engine.decide(call);
    if (v.decision !== "ask") audit.record(call, v, "auto");
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse" as const,
        permissionDecision: v.decision,
        permissionDecisionReason: v.decision === "deny" ? denyMessage(v) : v.reason,
      },
    };
  };
}
