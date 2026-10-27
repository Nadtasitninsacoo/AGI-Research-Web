// Verification-layer unit tests. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildHandoff,
  confirmFinding,
  confirmFindings,
  decideSuccess,
  evidenceSignature,
  injectHandoff,
  isGuardrailBlocked,
  triageUnverified,
  validatePlan,
  verifyHandoff,
  verifySubtask,
} from "../src/verify.mjs";

test("verifySubtask: real work verifies, errors/empties/failures do not", () => {
  // A finding needs backing evidence now: a successful command confirms it.
  assert.equal(verifySubtask({ status: "succeeded", summary: "Found open 22/tcp with banner X", evidence: { commandsRun: 1, commandsOk: 1 } }).verified, true);
  assert.equal(verifySubtask({ status: "failed", summary: "whatever" }).verified, false);
  assert.equal(verifySubtask({ status: "succeeded", summary: "" }).verified, false);
  assert.equal(verifySubtask({ status: "succeeded", summary: "ERROR: empty command." }).verified, false);
  assert.equal(verifySubtask({ status: "succeeded", summary: "Stopped after 3 consecutive tool failures" }).verified, false);
});

test("verifySubtask: evidence overrides a confident summary (Problem D)", () => {
  // Ran commands but all failed -> not verified, however good the summary sounds.
  assert.equal(
    verifySubtask({ status: "succeeded", summary: "All checks passed, target is secure.", evidence: { commandsRun: 3, commandsOk: 0 } }).verified,
    false,
  );
  // Ran commands and some succeeded -> verified.
  assert.equal(verifySubtask({ status: "succeeded", summary: "Scanned ports", evidence: { commandsRun: 3, commandsOk: 2 } }).verified, true);
});

test("verifySubtask: narrative-only work with no evidence does NOT verify", () => {
  // No commands, no confirmed finding -> a narrative, not a result (the Ollama-down / 0-evidence case).
  assert.equal(verifySubtask({ status: "succeeded", summary: "Analysis of the handed-off data", evidence: { commandsRun: 0, commandsOk: 0 } }).verified, false);
  // But a confirmed finding is real evidence even with no command of its own.
  assert.equal(verifySubtask({ status: "succeeded", summary: "Confirmed from prior data", evidence: { commandsRun: 0, commandsOk: 0 }, confirmedFindings: 1 }).verified, true);
});

test("evidenceSignature changes only when real evidence is added", () => {
  const base = [{ verified: true, findings: [{ confirmed: true }], evidence: { commandsOk: 2 } }];
  const same = [{ verified: true, findings: [{ confirmed: true }], evidence: { commandsOk: 2 } }];
  const more = [...base, { verified: false, findings: [], evidence: { commandsOk: 0 } }]; // added nothing real
  assert.equal(evidenceSignature(base), evidenceSignature(same));
  assert.equal(evidenceSignature(base), evidenceSignature(more)); // narrative-only addition -> no change
  const grew = [...base, { verified: true, findings: [], evidence: { commandsOk: 1 } }];
  assert.notEqual(evidenceSignature(base), evidenceSignature(grew));
});

test("validatePlan drops exact-duplicate subtasks, keeps distinct ones (Problem C)", () => {
  const { plan, dropped } = validatePlan([
    { agent: "RECON-1", task: "scan ports on app.local" },
    { agent: "RECON-1", task: "scan ports on app.local" }, // exact dup -> dropped
    { agent: "RECON-1", task: "enumerate subdomains" }, // same agent, different task -> kept
    { agent: "ORACLE-7", task: "" }, // empty task -> dropped
  ]);
  assert.deepEqual(plan.map((s) => `${s.agent}:${s.task}`), ["RECON-1:scan ports on app.local", "RECON-1:enumerate subdomains"]);
  assert.equal(dropped.length, 2);
});

test("confirmFinding: evidence + a successful command confirms; claims do not", () => {
  assert.equal(confirmFinding({ evidence: "200 OK, missing CSP header" }, { commandsOk: 2 }).confirmed, true);
  assert.equal(confirmFinding({ evidence: "" }, { commandsOk: 5 }).confirmed, false); // no evidence
  assert.equal(confirmFinding({ evidence: "looks vulnerable" }, { commandsOk: 0 }).confirmed, false); // nothing ran
  // report_finding persisted evidence is trusted (that tool requires evidence by contract).
  assert.equal(confirmFinding({ evidence: "PoC request/response", source: "report_finding" }, { commandsOk: 0 }).confirmed, true);
});

test("confirmFindings tags each finding with its judgment", () => {
  const out = confirmFindings([{ title: "a", evidence: "x" }, { title: "b", evidence: "" }], { commandsOk: 1 });
  assert.deepEqual(out.map((f) => f.confirmed), [true, false]);
  assert.ok(out[1].reason.includes("no evidence"));
});

test("buildHandoff + injectHandoff carry prior results as labelled data", () => {
  const prior = [{ agent: "RECON-1", task: "scan", summary: "ports 80,443 open" }];
  const ho = buildHandoff(prior);
  assert.ok(ho.chars > 0 && ho.sources.includes("RECON-1"));
  const injected = injectHandoff("analyse services", ho);
  assert.match(injected, /PRIOR TEAM RESULTS/);
  assert.match(injected, /ports 80,443 open/);
});

test("verifyHandoff: RECON-1 output reaches ORACLE-7, or it is caught if dropped", () => {
  const prior = [{ agent: "RECON-1", task: "scan", summary: "ports 80,443 open" }];
  const ho = buildHandoff(prior);
  const injected = injectHandoff("analyse", ho);
  assert.equal(verifyHandoff(ho, injected).ok, true); // carried
  assert.equal(verifyHandoff(ho, "analyse").ok, false); // dropped -> detected
  assert.equal(verifyHandoff(buildHandoff([]), "analyse").ok, false); // nothing to hand off
});

test("buildHandoff skips empty prior summaries", () => {
  const ho = buildHandoff([{ agent: "X", task: "t", summary: "" }, { agent: "Y", task: "t2", summary: "data" }]);
  assert.deepEqual(ho.sources, ["Y"]);
});

test("decideSuccess requires at least one verified subtask", () => {
  assert.equal(decideSuccess([{ verified: true }, { verified: false }]).status, "succeeded");
  assert.equal(decideSuccess([{ verified: false }, { verified: false }]).status, "failed");
  assert.equal(decideSuccess([]).status, "failed");
  assert.equal(decideSuccess([{ verified: true }]).verifiedCount, 1);
});

test("isGuardrailBlocked: blocked with no successful command is a guardrail stop", () => {
  assert.equal(isGuardrailBlocked({ blocked: 3, commandsOk: 0 }), true);
  assert.equal(isGuardrailBlocked({ blocked: 2, commandsOk: 1 }), false); // made some progress -> technical
  assert.equal(isGuardrailBlocked({ blocked: 0, commandsOk: 0 }), false); // nothing blocked
});

test("triageUnverified: guardrail stops escalate, technical dead-ends retry, verified skipped", () => {
  const results = [
    { agent: "A", verified: true, evidence: { commandsOk: 2 } },
    { agent: "B", verified: false, evidence: { blocked: 2, commandsOk: 0 } }, // guardrail -> escalate
    { agent: "C", verified: false, evidence: { blocked: 0, commandsOk: 0 } }, // technical -> retry
    { agent: "D", verified: false, evidence: { blocked: 1, commandsOk: 3 } }, // partial progress -> retry
  ];
  const { retry, escalate } = triageUnverified(results);
  assert.deepEqual(escalate.map((r) => r.agent), ["B"]);
  assert.deepEqual(retry.map((r) => r.agent), ["C", "D"]);
});
