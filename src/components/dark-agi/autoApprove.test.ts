import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTO_APPROVE_OPS, canAutoApprove, formatRemaining } from "./autoApprove.ts";

const job = (over: Partial<Parameters<typeof canAutoApprove>[0]> = {}) => ({
  id: "j1",
  toolId: "nmap",
  operationId: "port-inventory",
  status: "AWAITING_APPROVAL",
  targets: ["192.168.1.16"],
  ...over,
});
const NOW = 1_000_000;
const none = new Set<string>();

test("approves an allowlisted scan while armed", () => {
  assert.equal(canAutoApprove(job(), NOW + 60_000, NOW, none), true);
});

test("never when not armed or when the window has expired", () => {
  assert.equal(canAutoApprove(job(), null, NOW, none), false);
  assert.equal(canAutoApprove(job(), NOW, NOW, none), false);
  assert.equal(canAutoApprove(job(), NOW - 1, NOW, none), false);
});

test("risky operations are never on the list", () => {
  for (const op of [
    "metasploit:exploit-launch",
    "rubeus:kerberoast",
    "sharphound:ad-collect",
    "hashcat:test-hash-audit",
    "john:test-hash-audit",
    "powershell:system-info-remote",
    "nmap:script-scan",
    "masscan:rate-limited-port-scan",
  ]) {
    assert.equal(AUTO_APPROVE_OPS.has(op), false, op);
    const [toolId, operationId] = op.split(":");
    assert.equal(canAutoApprove(job({ toolId, operationId }), NOW + 60_000, NOW, none), false, op);
  }
});

test("only jobs actually awaiting approval, each at most once, with targets", () => {
  assert.equal(canAutoApprove(job({ status: "QUEUED" }), NOW + 1, NOW, none), false);
  assert.equal(canAutoApprove(job(), NOW + 1, NOW, new Set(["j1"])), false);
  assert.equal(canAutoApprove(job({ targets: [] }), NOW + 1, NOW, none), false);
});

test("countdown formatting", () => {
  assert.equal(formatRemaining(30 * 60_000), "30:00");
  assert.equal(formatRemaining(61_000), "1:01");
  assert.equal(formatRemaining(-5), "0:00");
});
