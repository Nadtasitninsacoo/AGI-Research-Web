import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SEQUENCE_STEPS,
  activeScopesFrom,
  autoFill,
  hasUserTarget,
  inputFor,
  isScopeAmbiguityError,
  resolveSelection,
  targetFieldOf,
  type Scope,
} from "./scopePick.ts";

const sc = (id: string, targets: string[]): Scope => ({ id, name: id, targets, active: true });
const TARGETS = { name: "targets", fieldType: "targets" } as const;
const SINGLE = { name: "host", fieldType: "single" } as const;

test("ambiguity error keys off the exact substring and only on 400", () => {
  const msg = "Service identification needs a target. 4 scope(s) are active, so it cannot be resolved";
  assert.equal(isScopeAmbiguityError(400, msg), true);
  assert.equal(isScopeAmbiguityError(403, msg), false);
  assert.equal(isScopeAmbiguityError(400, "Invalid operation input"), false);
  assert.equal(isScopeAmbiguityError(400, undefined), false);
});

test("only active scopes are usable", () => {
  const out = activeScopesFrom({
    items: [
      { id: "a", name: "A", targets: ["1.1.1.1"], active: true },
      { id: "b", name: "B", targets: ["2.2.2.2"], active: false },
      { id: "c", name: "C" },
    ],
  });
  assert.deepEqual(out.map((s) => s.id), ["a"]);
});

test("target field: network only; array vs single", () => {
  assert.deepEqual(
    targetFieldOf({ toolId: "nmap", operationId: "x", targetKind: "network", fields: [{ name: "targets", type: "targets" }] }),
    TARGETS,
  );
  assert.deepEqual(
    targetFieldOf({ toolId: "p", operationId: "x", targetKind: "network", fields: [{ name: "domain", type: "text" }] }),
    { name: "domain", fieldType: "single" },
  );
  assert.equal(targetFieldOf({ toolId: "p", operationId: "x", targetKind: "local", fields: [{ name: "host", type: "text" }] }), null);
});

test("a user-supplied target is detected (never overridden)", () => {
  assert.equal(hasUserTarget({ targets: ["10.0.0.5"] }, TARGETS), true);
  assert.equal(hasUserTarget({ targets: [] }, TARGETS), false);
  assert.equal(hasUserTarget({ host: "a.com" }, SINGLE), true);
  assert.equal(hasUserTarget({}, SINGLE), false);
});

test("run together merges + de-duplicates, array fields only", () => {
  const r = resolveSelection([sc("a", ["1.1.1.1", "2.2.2.2"]), sc("b", ["2.2.2.2", "3.3.3.3"])], TARGETS, "together");
  assert.deepEqual(r, { mode: "single", targets: ["1.1.1.1", "2.2.2.2", "3.3.3.3"] });
  assert.ok("error" in resolveSelection([sc("a", ["1.1.1.1"]), sc("b", ["2.2.2.2"])], SINGLE, "together"));
});

test("one at a time: per scope for arrays, per address for single", () => {
  const sel = [sc("a", ["1.1.1.1", "2.2.2.2"]), sc("b", ["3.3.3.3"])];
  const arr = resolveSelection(sel, TARGETS, "each");
  assert.ok("mode" in arr && arr.mode === "sequence");
  if ("steps" in arr) assert.deepEqual(arr.steps.map((s) => s.targets), [["1.1.1.1", "2.2.2.2"], ["3.3.3.3"]]);
  const one = resolveSelection(sel, SINGLE, "each");
  if ("steps" in one) assert.deepEqual(one.steps.map((s) => s.targets), [["1.1.1.1"], ["2.2.2.2"], ["3.3.3.3"]]);
});

test("sequence is capped at 20 steps and flagged truncated", () => {
  const many = Array.from({ length: 25 }, (_, i) => `10.0.0.${i + 1}`);
  const r = resolveSelection([sc("a", many)], SINGLE, "each");
  assert.ok("steps" in r);
  if ("steps" in r) {
    assert.equal(r.steps.length, MAX_SEQUENCE_STEPS);
    assert.equal(r.truncated, true);
  }
});

test("a selection that resolves to one target becomes a single job", () => {
  assert.deepEqual(resolveSelection([sc("a", ["1.1.1.1"])], SINGLE, "each"), { mode: "single", targets: ["1.1.1.1"] });
});

test("single field never auto-fills a multi-address scope", () => {
  const r = autoFill(sc("big", ["1.1.1.1", "2.2.2.2"]), SINGLE);
  assert.equal(r.ok, false);
  assert.deepEqual(autoFill(sc("one", ["1.1.1.1"]), SINGLE), { ok: true, value: "1.1.1.1" });
});

test("inputFor keeps the user's other fields and shapes the target field", () => {
  assert.deepEqual(inputFor({ maxRate: 5 }, TARGETS, ["1.1.1.1", "2.2.2.2"]), { maxRate: 5, targets: ["1.1.1.1", "2.2.2.2"] });
  assert.deepEqual(inputFor({}, SINGLE, ["a.com"]), { host: "a.com" });
});
