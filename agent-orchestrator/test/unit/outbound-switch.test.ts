import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine } from "../../src/permissions/engine.js";
import { testConfig } from "./helpers.js";

const ext = "curl https://example.com/data";
const local = "curl http://localhost:3000/api/health";

test("switch off: external URL is ask (never silently allowed); internal stays as-is", () => {
  const engine = createEngine(testConfig(), { outboundBlocked: () => false });
  assert.equal(engine.decide({ tool: "Bash", input: { command: ext } }).decision, "ask");
});

test("switch on: external URL is hard-denied, by a locked rule", () => {
  const engine = createEngine(testConfig(), { outboundBlocked: () => true });
  const v = engine.decide({ tool: "Bash", input: { command: ext } });
  assert.equal(v.decision, "deny");
  assert.equal(v.ruleId, "deny-external-url");
});

test("the switch is read live, so flipping it changes the decision without rebuilding", () => {
  let blocked = false;
  const engine = createEngine(testConfig(), { outboundBlocked: () => blocked });
  assert.equal(engine.decide({ tool: "Bash", input: { command: ext } }).decision, "ask");
  blocked = true;
  assert.equal(engine.decide({ tool: "Bash", input: { command: ext } }).decision, "deny");
});

test("the switch never blocks local/internal network calls", () => {
  const engine = createEngine(testConfig(), { outboundBlocked: () => true });
  assert.notEqual(engine.decide({ tool: "Bash", input: { command: local } }).ruleId, "deny-external-url");
});