import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { loadConfig, resolveConfig } from "../../src/config/load.js";
import { ORCH_ROOT } from "../../src/util/paths.js";

test("agent.config.ts loads and resolves paths", async () => {
  const cfg = await loadConfig();
  assert.equal(cfg.targetRepo, path.resolve(ORCH_ROOT, process.env.TARGET_REPO ?? ".."));
  assert.equal(cfg.paths.prompts, path.join(ORCH_ROOT, "prompts"));
  assert.equal(cfg.effort, "high");
});

test("invalid config fails with a readable message", () => {
  const file = path.join(ORCH_ROOT, "agent.config.ts");
  assert.throws(() => resolveConfig({ models: {} }, file), /targetRepo[\s\S]*models\.main|models\.main[\s\S]*targetRepo/);
  assert.throws(
    () => resolveConfig({ targetRepo: ".", models: { main: "m" }, permissions: { rules: [{ id: "x", decision: "deny", tools: ["Bash"], command: "(" }] } }, file),
    /not a valid regular expression/,
  );
});
