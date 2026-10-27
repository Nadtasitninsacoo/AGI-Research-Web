import path from "node:path";
import type { RuleConfig } from "../config/schema.js";
import { toPosix } from "../util/paths.js";
import type { Rule, Subject, ToolCall } from "./types.js";

export function toolMatches(patterns: string[], tool: string): boolean {
  return patterns.some((p) => p === "*" || p === tool || (p.endsWith("*") && tool.startsWith(p.slice(0, -1))));
}

/** The file or directory a tool call targets, absolute with forward slashes. */
export function targetPath(call: ToolCall, cwd: string): string | undefined {
  for (const key of ["file_path", "notebook_path", "path"]) {
    const v = call.input[key];
    if (typeof v === "string" && v) return toPosix(v, cwd);
  }
  return undefined;
}

/** Search globs/patterns of Glob and Grep, which can name files on their own. */
export function searchPatterns(s: Subject): string[] {
  return ["glob", "pattern"].map((k) => s.input[k]).filter((v): v is string => typeof v === "string");
}

/** Turn a declarative config rule into a matcher. */
export function compileRule(cfg: RuleConfig): Rule {
  const command = cfg.command ? new RegExp(cfg.command, "i") : undefined;
  return {
    id: cfg.id,
    decision: cfg.decision,
    reason: cfg.reason ?? `config rule "${cfg.id}"`,
    tools: cfg.tools,
    matches: (s) =>
      (!command || (s.segment !== undefined && command.test(s.segment))) &&
      (!cfg.path || (s.path !== undefined && path.posix.matchesGlob(s.path, cfg.path))),
  };
}
