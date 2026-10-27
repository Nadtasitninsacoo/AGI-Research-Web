import path from "node:path";
import type { ResolvedConfig } from "../config/load.js";
import { ORCH_ROOT } from "../util/paths.js";
import { BUILTIN_RULES } from "./defaults.js";
import { reachesExternalUrl } from "./network.js";
import { compileRule, targetPath, toolMatches } from "./rules.js";
import { hiddenEffect, splitCommand } from "./shell.js";
import type { Rule, RuleContext, Subject, ToolCall, Verdict } from "./types.js";

/** Runtime-togglable policy the engine reads live, so an admin switch applies without rebuilding. */
export type EngineSwitches = { outboundBlocked: () => boolean };

const NO_SWITCHES: EngineSwitches = { outboundBlocked: () => false };

const RANK = { allow: 0, ask: 1, deny: 2 } as const;

const FALLBACK: Verdict = { decision: "ask", ruleId: "fallback", reason: "No rule allows this call." };

const stricter = (a: Verdict, b: Verdict) => (RANK[b.decision] > RANK[a.decision] ? b : a);

export class PermissionEngine {
  constructor(
    private readonly rules: Rule[],
    private readonly ctx: RuleContext,
    private readonly cwd: string,
  ) {}

  decide(call: ToolCall): Verdict {
    if (call.tool === "Bash") return this.decideShell(call);
    return this.decideSubject({ ...call, path: targetPath(call, this.cwd) });
  }

  /** Every segment is judged on its own; the strictest verdict wins. */
  private decideShell(call: ToolCall): Verdict {
    const command = typeof call.input.command === "string" ? call.input.command : "";
    const verdicts = splitCommand(command).map((segment) => this.decideSubject({ ...call, segment }));
    const hidden = hiddenEffect(command);
    if (hidden) verdicts.push({ decision: "ask", ruleId: "ask-hidden-effect", reason: `The command uses ${hidden}.` });
    return verdicts.length ? verdicts.reduce(stricter) : FALLBACK;
  }

  private decideSubject(s: Subject): Verdict {
    let best: Verdict | undefined;
    for (const r of this.rules) {
      if (!toolMatches(r.tools, s.tool) || !r.matches(s, this.ctx)) continue;
      const v: Verdict = { decision: r.decision, ruleId: r.id, reason: r.reason };
      best = best ? stricter(best, v) : v;
    }
    return best ?? FALLBACK;
  }
}

/** Built-ins minus the disabled ones, then the config's own rules. */
export function buildRules(cfg: ResolvedConfig): Rule[] {
  const byId = new Map(BUILTIN_RULES.map((r) => [r.id, r]));
  for (const id of cfg.permissions.disable) {
    const r = byId.get(id);
    if (!r) throw new Error(`permissions.disable: unknown rule "${id}"`);
    if (r.locked) throw new Error(`permissions.disable: rule "${id}" is locked and cannot be disabled`);
  }
  const disabled = new Set(cfg.permissions.disable);
  return [...BUILTIN_RULES.filter((r) => !disabled.has(r.id)), ...cfg.permissions.rules.map(compileRule)];
}

/**
 * External-network guard, in two locked rules:
 *  - when the admin switch is on, deny any reach to an external URL (hard block);
 *  - otherwise mark it "ask", so approve mode prompts and auto mode defers it (never silent).
 * Deny outranks ask, so with the switch on the deny wins and nothing is prompted.
 */
function outboundRules(switches: EngineSwitches): Rule[] {
  const external = (s: Subject) => s.segment !== undefined && reachesExternalUrl(s.segment);
  return [
    {
      id: "deny-external-url",
      decision: "deny",
      locked: true,
      tools: ["Bash"],
      reason: "The administrator has blocked outbound network access. This command reaches an external URL.",
      matches: (s) => switches.outboundBlocked() && external(s),
    },
    {
      id: "ask-external-url",
      decision: "ask",
      locked: true,
      tools: ["Bash"],
      reason: "This command reaches a URL outside this machine. In approve mode it needs your approval; in auto mode it is deferred.",
      matches: external,
    },
  ];
}

export function createEngine(cfg: ResolvedConfig, switches: EngineSwitches = NO_SWITCHES): PermissionEngine {
  const ctx: RuleContext = {
    writableRoots: [cfg.targetRepo, cfg.paths.scratchpad],
    protectedRoots: [
      path.join(ORCH_ROOT, "src"),
      cfg.paths.prompts,
      cfg.configFile,
      path.join(ORCH_ROOT, "package.json"),
    ],
  };
  return new PermissionEngine([...outboundRules(switches), ...buildRules(cfg)], ctx, cfg.targetRepo);
}
