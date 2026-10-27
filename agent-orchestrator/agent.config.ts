import { defineConfig } from "./src/config/schema.js";

/**
 * Single source of configuration. Paths are relative to this file.
 * Override the file with AGENT_CONFIG=<path>.
 */
export default defineConfig({
  targetRepo: process.env.TARGET_REPO ?? "..",
  models: { main: process.env.ORCH_MODEL ?? "claude-opus-5-5" },
  effort: "high",
  // First-run default only. Once a human picks a mode (/mode), it is stored in
  // state/runtime-state.json and survives restarts until they change it again.
  //   approve: pause for a human at every ask-action and before continuing unfinished work.
  //   auto:    proceed unattended; deny still blocks and ask-actions are deferred for a human.
  mode: "approve",
  permissions: {
    // Extra rules on top of the built-ins (src/permissions/defaults.ts).
    // Precedence: deny > ask > allow; a call no rule allows is asked.
    rules: [
      // { id: "allow-build", decision: "allow", tools: ["Bash"], command: "^npm run build$" },
    ],
    // Built-in rule ids to turn off, e.g. "ask-git-history" for a team that commits freely.
    disable: [],
  },
  paths: { logs: "logs", scratchpad: "scratchpad", prompts: "prompts" },
  // Admin kill switch for outbound network access. This is only the first-run default;
  // the operator flips it at runtime with /outbound and the choice persists in state/.
  //   true  = hard-deny any command reaching an external URL (curl/wget/… to the internet).
  //   false = ask before such a command (approve mode prompts; auto mode defers it).
  security: { blockExternalUrls: false },
});
