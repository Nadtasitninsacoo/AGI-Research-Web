import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNseScripts, clampMaxRate, parseTargetsInput } from "./nseAllowList.ts";

test("validateNseScripts accepts allow-listed names case-insensitively and dedupes", () => {
  const r = validateNseScripts(["Default", "safe", "default"]);
  assert.deepEqual(r, { ok: true, scripts: ["default", "safe"] });
});

test("validateNseScripts rejects a blocked category", () => {
  const r = validateNseScripts(["brute"]);
  assert.equal(r.ok, false);
});

test("validateNseScripts rejects a path or a .lua filename", () => {
  assert.equal(validateNseScripts(["../etc/passwd"]).ok, false);
  assert.equal(validateNseScripts(["custom.lua"]).ok, false);
});

test("validateNseScripts rejects a name off the allow-list", () => {
  assert.equal(validateNseScripts(["totally-made-up"]).ok, false);
});

test("validateNseScripts requires at least one script", () => {
  assert.equal(validateNseScripts([]).ok, false);
});

test("clampMaxRate clamps to the cap and falls back on invalid input", () => {
  assert.equal(clampMaxRate(50000, 1000), 1000);
  assert.equal(clampMaxRate(200, 1000), 200);
  assert.equal(clampMaxRate(null, 1000), 500);
  assert.equal(clampMaxRate(NaN, 1000, 250), 250);
});

test("parseTargetsInput splits on commas and newlines, trims and dedupes", () => {
  const r = parseTargetsInput("10.0.0.5, 10.0.0.6\n10.0.0.5\n\n10.0.0.7");
  assert.deepEqual(r, ["10.0.0.5", "10.0.0.6", "10.0.0.7"]);
});
