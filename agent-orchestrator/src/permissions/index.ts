import type { CanUseTool, HookCallback } from "@anthropic-ai/claude-agent-sdk";
import type { ResolvedConfig } from "../config/load.js";
import type { Mode } from "../config/schema.js";
import { AuditLog } from "./audit.js";
import { createCanUseTool, type Asker } from "./can-use-tool.js";
import { DenialMemory } from "./denials.js";
import { createEngine, type PermissionEngine } from "./engine.js";
import { createPermissionHook } from "./hook.js";

export type { Asker, PermissionRequest } from "./can-use-tool.js";
export { denyAll } from "./can-use-tool.js";

/** The engine is shared with sub-agent jobs so they enforce the same policy. */
export type PermissionGate = { hook: HookCallback; canUseTool: CanUseTool; audit: AuditLog; engine: PermissionEngine };

export type GateDeps = {
  /** Asks a human in approve mode. Ignored in auto mode, which defers instead. */
  ask: Asker;
  /** Read live so a mode change applies without restarting the session. */
  getMode: () => Mode;
  /** Read live so the admin's outbound kill switch applies without a restart. */
  getOutboundBlocked?: () => boolean;
  logDir: string;
};

/** Everything a query() needs to enforce the policy, sharing one engine, audit log and denial memory. */
export function createPermissionGate(cfg: ResolvedConfig, deps: GateDeps): PermissionGate {
  const engine = createEngine(cfg, { outboundBlocked: deps.getOutboundBlocked ?? (() => false) });
  const audit = new AuditLog(deps.logDir);
  return {
    hook: createPermissionHook(engine, audit),
    canUseTool: createCanUseTool(engine, deps.ask, new DenialMemory(), audit, deps.getMode),
    audit,
    engine,
  };
}
