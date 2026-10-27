import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadContext } from "../../src/session/context-loader.js";
import { testConfig } from "./helpers.js";

/** A config whose memory/progress point at a throwaway dir we control. */
function ctxConfig(seed: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-ctx-"));
  fs.mkdirSync(path.join(dir, "memory"));
  seed(dir);
  const cfg = testConfig();
  return { ...cfg, paths: { ...cfg.paths, memory: path.join(dir, "memory"), progress: path.join(dir, "PROGRESS.md") } };
}

test("context includes the mode, and the mode line differs by mode", () => {
  const cfg = ctxConfig(() => {});
  assert.match(loadContext(cfg, "auto"), /Mode: \*\*auto\*\*[\s\S]*deferred/);
  assert.match(loadContext(cfg, "approve"), /Mode: \*\*approve\*\*[\s\S]*pause for the user/);
});

test("context carries PROGRESS.md so a fresh session can answer 'what's left'", () => {
  const cfg = ctxConfig((dir) => fs.writeFileSync(path.join(dir, "PROGRESS.md"), "## Remaining\n- wire up MCP\n"));
  const out = loadContext(cfg, "approve");
  assert.match(out, /Project status/);
  assert.match(out, /wire up MCP/);
});

test("context notes the absence of PROGRESS.md instead of failing", () => {
  assert.match(loadContext(ctxConfig(() => {}), "approve"), /No PROGRESS\.md yet/);
});

test("context includes the memory index when present", () => {
  const cfg = ctxConfig((dir) =>
    fs.writeFileSync(path.join(dir, "memory", "u.md"), "---\nname: boss\ndescription: prefers Thai\ntype: user\n---\nx\n"),
  );
  assert.match(loadContext(cfg, "approve"), /Memory index[\s\S]*boss/);
});
