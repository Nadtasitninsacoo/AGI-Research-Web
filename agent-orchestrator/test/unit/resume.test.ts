import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { hasUnfinishedWork, resumePrompt } from "../../src/session/resume.js";
import { testConfig } from "./helpers.js";

function cfgWithProgress(content?: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-resume-"));
  const progress = path.join(dir, "PROGRESS.md");
  if (content !== undefined) fs.writeFileSync(progress, content);
  const cfg = testConfig();
  return { ...cfg, paths: { ...cfg.paths, progress } };
}

test("unfinished work is detected only when PROGRESS.md has content", () => {
  assert.equal(hasUnfinishedWork(cfgWithProgress("## Remaining\n- x\n")), true);
  assert.equal(hasUnfinishedWork(cfgWithProgress("   \n")), false);
  assert.equal(hasUnfinishedWork(cfgWithProgress()), false);
});

test("the resume prompt carries the four steps and the mode-specific action", () => {
  const cfg = testConfig();
  const approve = resumePrompt(cfg, "approve");
  assert.match(approve, /Sense[\s\S]*Assess[\s\S]*Decide[\s\S]*Act/);
  assert.match(approve, /STOP\. Do not change any/);
  assert.ok(!/do not need to wait/i.test(approve));

  const auto = resumePrompt(cfg, "auto");
  assert.match(auto, /yourself now/);
  assert.match(auto, /do not need to wait/i);
});
