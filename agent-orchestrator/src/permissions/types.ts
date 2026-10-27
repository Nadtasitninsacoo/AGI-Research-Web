import type { Decision } from "../config/schema.js";

export type { Decision };

export type ToolCall = { tool: string; input: Record<string, unknown> };

/** What a rule is tested against: the call, one Bash segment, and the resolved target path. */
export type Subject = ToolCall & { segment?: string; path?: string };

export type RuleContext = {
  /** Writes here are allowed without asking. */
  writableRoots: string[];
  /** Writes here always ask, even when inside a writable root (the orchestrator's own code and config). */
  protectedRoots: string[];
};

export type Rule = {
  id: string;
  decision: Decision;
  reason: string;
  /** Tool names; "*" matches any tool, a trailing "*" matches a prefix. */
  tools: string[];
  /** Locked rules cannot be disabled from config. */
  locked?: boolean;
  matches: (s: Subject, ctx: RuleContext) => boolean;
};

export type Verdict = { decision: Decision; ruleId: string; reason: string };
