import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import type { Mode } from "../config/schema.js";
import type { AuditLog } from "./audit.js";
import type { DenialMemory } from "./denials.js";
import type { PermissionEngine } from "./engine.js";
import { DEFERRED, denyMessage, REPEAT_DECLINED, USER_DECLINED } from "./messages.js";
import type { ToolCall, Verdict } from "./types.js";

export type PermissionRequest = ToolCall & Pick<Verdict, "reason" | "ruleId">;

/** Asks a human. Resolves true to allow. Must resolve false when `signal` aborts. */
export type Asker = (req: PermissionRequest, signal: AbortSignal) => Promise<boolean>;

/** Never asks anyone: every "ask" becomes a denial. For headless runs and tests. */
export const denyAll: Asker = async () => false;

export function createCanUseTool(
  engine: PermissionEngine,
  ask: Asker,
  denials: DenialMemory,
  audit: AuditLog,
  getMode: () => Mode,
): CanUseTool {
  return async (tool, input, { signal }) => {
    const call = { tool, input };
    const v = engine.decide(call);
    if (v.decision === "allow") return { behavior: "allow", updatedInput: input };
    if (v.decision === "deny") return { behavior: "deny", message: denyMessage(v) };
    // Auto mode: no human is driving, so an ask-level action is deferred, never self-approved.
    if (getMode() === "auto") {
      audit.record(call, v, "deferred");
      return { behavior: "deny", message: DEFERRED };
    }
    if (denials.has(call)) {
      audit.record(call, v, "repeat-deny");
      return { behavior: "deny", message: REPEAT_DECLINED };
    }
    const ok = await ask({ ...call, reason: v.reason, ruleId: v.ruleId }, signal);
    audit.record(call, v, ok ? "user-allow" : "user-deny");
    if (ok) return { behavior: "allow", updatedInput: input };
    denials.add(call);
    return { behavior: "deny", message: USER_DECLINED };
  };
}
