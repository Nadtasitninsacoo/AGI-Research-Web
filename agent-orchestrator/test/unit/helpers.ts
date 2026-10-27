import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { resolveConfig, type ResolvedConfig } from "../../src/config/load.js";
import type { AgentConfigInput, Mode } from "../../src/config/schema.js";
import { createEngine } from "../../src/permissions/engine.js";
import { createPermissionGate, type Asker } from "../../src/permissions/index.js";
import { ORCH_ROOT } from "../../src/util/paths.js";

/** The project the agent works on in tests: the repo that contains this package. */
export const REPO = path.resolve(ORCH_ROOT, "..");

export function testConfig(over: Partial<AgentConfigInput> = {}): ResolvedConfig {
  return resolveConfig(
    { targetRepo: "..", models: { main: "test-model" }, paths: { logs: path.join(os.tmpdir(), "orch-test-logs") }, ...over },
    path.join(ORCH_ROOT, "agent.config.ts"),
  );
}

export function decider(over: Partial<AgentConfigInput> = {}) {
  const engine = createEngine(testConfig(over));
  return {
    bash: (command: string) => engine.decide({ tool: "Bash", input: { command } }),
    file: (tool: string, file_path: string) => engine.decide({ tool, input: { file_path } }),
    call: (tool: string, input: Record<string, unknown>) => engine.decide({ tool, input }),
  };
}

/** A gate wired to a temp log dir, a fixed mode and a scripted asker. */
export function makeGate(opts: { ask?: Asker; mode?: Mode } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-gate-"));
  return createPermissionGate(testConfig(), {
    ask: opts.ask ?? (async () => true),
    getMode: () => opts.mode ?? "approve",
    logDir: dir,
  });
}
