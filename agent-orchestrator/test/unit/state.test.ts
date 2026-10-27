import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { RuntimeState } from "../../src/state/runtime-state.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "orch-state-"));
const defaults = { mode: "approve" as const, outboundBlocked: false };

test("mode falls back to the config default until a human sets it", () => {
  assert.equal(new RuntimeState(tmp(), defaults).mode, "approve");
});

test("a chosen mode persists across restarts (new instance, same dir)", () => {
  const dir = tmp();
  new RuntimeState(dir, defaults).setMode("auto");
  // Simulate a restart: a fresh instance with a different config default must still read "auto".
  assert.equal(new RuntimeState(dir, defaults).mode, "auto");
});

test("the outbound kill switch persists across restarts, independent of mode", () => {
  const dir = tmp();
  const s = new RuntimeState(dir, defaults);
  assert.equal(s.outboundBlocked, false);
  s.setOutboundBlocked(true);
  s.setMode("auto");
  const restarted = new RuntimeState(dir, defaults);
  assert.equal(restarted.outboundBlocked, true);
  assert.equal(restarted.mode, "auto");
});

test("a corrupt state file is ignored, not fatal", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "runtime-state.json"), "{ not json");
  assert.equal(new RuntimeState(dir, defaults).mode, "approve");
});
