import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateNseScripts,
  clampMaxRate,
  validateTargets,
  targetsWithinScopes,
} from "../src/nmapGuard.mjs";

test("validateNseScripts accepts allow-listed names, lowercases and dedupes", () => {
  const r = validateNseScripts(["Default", "safe", "default"]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.scripts, ["default", "safe"]);
});

test("validateNseScripts rejects blocked categories even when spelled oddly", () => {
  const r = validateNseScripts(["INTRUSIVE"]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.rejected, ["INTRUSIVE"]);
});

test("validateNseScripts rejects a path or a .lua file, never reaching the allow-list check", () => {
  const r1 = validateNseScripts(["../../etc/passwd"]);
  assert.equal(r1.ok, false);
  const r2 = validateNseScripts(["custom-exploit.lua"]);
  assert.equal(r2.ok, false);
});

test("validateNseScripts rejects a name not on the allow-list", () => {
  const r = validateNseScripts(["some-random-script"]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.rejected, ["some-random-script"]);
});

test("validateNseScripts requires at least one script", () => {
  assert.equal(validateNseScripts([]).ok, false);
  assert.equal(validateNseScripts(undefined).ok, false);
});

test("clampMaxRate clamps to the configured cap and falls back for invalid input", () => {
  assert.equal(clampMaxRate(5000, 1000), 1000);
  assert.equal(clampMaxRate(100, 1000), 100);
  assert.equal(clampMaxRate(-5, 1000), 500);
  assert.equal(clampMaxRate("not-a-number", 1000), 500);
  assert.equal(clampMaxRate(undefined, 1000, 200), 200);
});

test("validateTargets requires at least one non-empty target", () => {
  assert.equal(validateTargets([]).ok, false);
  assert.equal(validateTargets(["  "]).ok, false);
  const r = validateTargets([" 10.0.0.5 ", "10.0.0.5"]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.targets, ["10.0.0.5"]);
});

test("targetsWithinScopes: exact match, CIDR and wildcard domain all cover", () => {
  const scopes = [{ targets: ["10.0.0.5", "10.1.0.0/24", "*.example.com"] }];
  const r = targetsWithinScopes(["10.0.0.5", "10.1.0.42", "host.example.com"], scopes);
  assert.equal(r.ok, true);
});

test("targetsWithinScopes reports every target not covered by any scope", () => {
  const scopes = [{ targets: ["10.0.0.0/24"] }];
  const r = targetsWithinScopes(["10.0.0.5", "203.0.113.9"], scopes);
  assert.equal(r.ok, false);
  assert.deepEqual(r.uncovered, ["203.0.113.9"]);
});

test("targetsWithinScopes with no scopes at all covers nothing", () => {
  const r = targetsWithinScopes(["10.0.0.5"], []);
  assert.equal(r.ok, false);
  assert.deepEqual(r.uncovered, ["10.0.0.5"]);
});
