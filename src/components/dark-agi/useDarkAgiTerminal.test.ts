import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDirectCommand } from "./useDarkAgiTerminal.ts";

// Regression coverage for the DIRECT-mode line parser — a real bug slipped
// through here once already (operationId swallowing " on <target>" whole
// because only the manual nmap:host-discovery repro was checked). These
// cover the shapes a reviewer flagged as untested: no-target ops, a
// non-nmap/powershell op, multi-target input, and inputs that could confuse
// a naive parser.

test("toolId:operationId with no target", () => {
  const r = parseDirectCommand("powershell:system-info");
  assert.deepEqual(r, {
    ok: true,
    toolId: "powershell",
    operationId: "system-info",
    targets: [],
  });
});

test("toolId:operationId on <target> — the bug's original repro", () => {
  const r = parseDirectCommand("nmap:host-discovery on 10.0.0.5");
  assert.deepEqual(r, {
    ok: true,
    toolId: "nmap",
    operationId: "host-discovery",
    targets: ["10.0.0.5"],
  });
});

test("non-nmap tool with a target — powershell:*-remote", () => {
  const r = parseDirectCommand("powershell:event-log-query-remote on dc01.lab.local");
  assert.deepEqual(r, {
    ok: true,
    toolId: "powershell",
    operationId: "event-log-query-remote",
    targets: ["dc01.lab.local"],
  });
});

test("CIDR target (contains a slash, no colon)", () => {
  const r = parseDirectCommand("masscan:rate-limited-port-scan on 192.168.56.0/24");
  assert.deepEqual(r, {
    ok: true,
    toolId: "masscan",
    operationId: "rate-limited-port-scan",
    targets: ["192.168.56.0/24"],
  });
});

test("multiple comma-separated targets are all captured, in order", () => {
  const r = parseDirectCommand("nmap:host-discovery on 10.0.0.5, 10.0.0.6,10.0.0.7");
  assert.deepEqual(r, {
    ok: true,
    toolId: "nmap",
    operationId: "host-discovery",
    targets: ["10.0.0.5", "10.0.0.6", "10.0.0.7"],
  });
});

test("multi-target list drops empty entries from stray/trailing commas", () => {
  const r = parseDirectCommand("nmap:host-discovery on 10.0.0.5,,10.0.0.6,");
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.targets, ["10.0.0.5", "10.0.0.6"]);
});

test("target with trailing whitespace is trimmed", () => {
  const r = parseDirectCommand("nmap:host-discovery on   10.0.0.5  ");
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.targets, ["10.0.0.5"]);
});

test("'on' is case-insensitive", () => {
  const r = parseDirectCommand("nmap:host-discovery ON 10.0.0.5");
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.targets, ["10.0.0.5"]);
});

test("rejects a line with no colon at all", () => {
  assert.deepEqual(parseDirectCommand("host-discovery"), { ok: false });
});

test("rejects empty operationId after the colon", () => {
  assert.deepEqual(parseDirectCommand("nmap:"), { ok: false });
});

test("rejects a bare toolId with trailing colon and target only", () => {
  // No operationId between ":" and " on " — must not silently treat the
  // target text as the operationId.
  assert.deepEqual(parseDirectCommand("nmap: on 10.0.0.5"), { ok: false });
});

test("free-text natural-language instruction (AI-mode-shaped input) is rejected, not mis-parsed", () => {
  // Thai natural-language text with no colon anywhere — must not accidentally
  // match as toolId:operationId.
  assert.deepEqual(
    parseDirectCommand("ลองเรียกใช้ชุดเครื่องมือของ Dark Agi สแกนหาช่องโหว่ port"),
    { ok: false },
  );
});
