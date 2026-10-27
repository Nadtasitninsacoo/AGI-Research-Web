import path from "node:path";
import type { HookCallback, Options } from "@anthropic-ai/claude-agent-sdk";
import type { ResolvedConfig } from "../config/load.js";
import { loadPrompt } from "../session/system-prompt.js";
import type { JobType } from "./types.js";

/** Tools each job type may use. Explore is read-only; worker adds writes and a policed Bash. */
const TOOLS: Record<JobType, string[]> = {
  explore: ["Read", "Glob", "Grep"],
  worker: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
};

/** SDK options for one job, minus the streaming prompt the Job supplies. */
export function agentOptions(cfg: ResolvedConfig, type: JobType, hook: HookCallback): Options {
  const tools = TOOLS[type];
  return {
    model: cfg.jobs.models[type],
    cwd: cfg.targetRepo,
    systemPrompt: { type: "preset", preset: "claude_code", append: loadPrompt(cfg, path.join("agents", type)) },
    tools,
    allowedTools: tools,
    // Jobs run unattended. The hook allows reads and denies secrets; nothing here needs a prompt,
    // and with no canUseTool an unexpected "ask" is denied rather than hanging.
    permissionMode: "default",
    hooks: { PreToolUse: [{ hooks: [hook] }] },
    maxTurns: cfg.jobs.maxTurnsPerJob,
    maxBudgetUsd: cfg.jobs.budgetUsdPerJob,
    settingSources: [],
  };
}
