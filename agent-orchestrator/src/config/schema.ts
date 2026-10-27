import { z } from "zod";

export const decisionSchema = z.enum(["allow", "ask", "deny"]);
export type Decision = z.infer<typeof decisionSchema>;

const regex = z.string().refine(
  (s) => {
    try {
      new RegExp(s, "i");
      return true;
    } catch {
      return false;
    }
  },
  { message: "not a valid regular expression" },
);

export const ruleSchema = z.object({
  id: z.string().min(1),
  decision: decisionSchema,
  /** Tool names; "*" matches any tool, a trailing "*" matches a prefix (e.g. "mcp__teams__*"). */
  tools: z.array(z.string().min(1)).min(1),
  /** Case-insensitive regex tested against each segment of a Bash command. */
  command: regex.optional(),
  /** Glob tested against the tool's target path (absolute, forward slashes). */
  path: z.string().optional(),
  reason: z.string().optional(),
});
export type RuleConfig = z.infer<typeof ruleSchema>;

const effortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);

export const modeSchema = z.enum(["approve", "auto"]);
export type Mode = z.infer<typeof modeSchema>;

export const configSchema = z.object({
  /** Repository the agents work on, relative to the config file. */
  targetRepo: z.string(),
  models: z.object({ main: z.string() }),
  effort: effortSchema.default("high"),
  /**
   * approve: pause for a human at every "ask" action and before continuing unfinished work.
   * auto: proceed without a human; "deny" still blocks and "ask" actions are deferred, not self-approved.
   */
  mode: modeSchema.default("approve"),
  jobs: z
    .object({
      /** How many background jobs may run at once. */
      maxConcurrent: z.number().int().positive().default(3),
      /** Cost ceiling per job; the SDK stops the job when it is reached. */
      budgetUsdPerJob: z.number().positive().default(1),
      /** API round-trips a job may take before stopping. */
      maxTurnsPerJob: z.number().int().positive().default(30),
      /** Model per sub-agent type. The read-only agent defaults to the cheaper model. */
      models: z
        .object({ explore: z.string().default("claude-sonnet-5-5"), worker: z.string().default("claude-opus-5-5") })
        .default({ explore: "claude-sonnet-5-5", worker: "claude-opus-5-5" }),
    })
    .default({ maxConcurrent: 3, budgetUsdPerJob: 1, maxTurnsPerJob: 30, models: { explore: "claude-sonnet-5-5", worker: "claude-opus-5-5" } }),
  /** Resume Loop: analyse unfinished work at session start and (in auto mode) continue it. */
  resume: z.object({ onStart: z.boolean().default(true) }).default({ onStart: true }),
  security: z
    .object({
      /**
       * First-run default for the admin's external-network kill switch. When on, shell commands
       * that reach a URL outside this machine/private network are hard-denied. A human toggles it
       * at runtime (/outbound) and the choice persists. When off, such commands are asked, not blocked.
       */
      blockExternalUrls: z.boolean().default(false),
    })
    .default({ blockExternalUrls: false }),
  permissions: z
    .object({
      rules: z.array(ruleSchema).default([]),
      /** Ids of built-in rules to turn off. Locked rules (deny, outbound) cannot be disabled. */
      disable: z.array(z.string()).default([]),
    })
    .default({ rules: [], disable: [] }),
  paths: z
    .object({
      logs: z.string().default("logs"),
      scratchpad: z.string().default("scratchpad"),
      prompts: z.string().default("prompts"),
      /** Persistent per-install state (e.g. the current mode). Not per-run. */
      state: z.string().default("state"),
      /** Cross-session memory: one file per topic plus INDEX.md. */
      memory: z.string().default("memory"),
      /** Project status: done / in progress / waiting / decisions. */
      progress: z.string().default("PROGRESS.md"),
    })
    .default({ logs: "logs", scratchpad: "scratchpad", prompts: "prompts", state: "state", memory: "memory", progress: "PROGRESS.md" }),
});

export type AgentConfigInput = z.input<typeof configSchema>;
export type AgentConfig = z.output<typeof configSchema>;

/** Identity helper that gives `agent.config.ts` type checking and editor completion. */
export function defineConfig(config: AgentConfigInput): AgentConfigInput {
  return config;
}
