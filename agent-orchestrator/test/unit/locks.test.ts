import assert from "node:assert/strict";
import { test } from "node:test";
import { LockManager } from "../../src/jobs/locks.js";

test("a file has one owner; another job is refused until release", () => {
  const locks = new LockManager();
  assert.deepEqual(locks.acquire("a", "/repo/x.ts"), { ok: true });
  assert.deepEqual(locks.acquire("a", "/repo/x.ts"), { ok: true }); // same owner is fine
  const r = locks.acquire("b", "/repo/x.ts");
  assert.ok(!r.ok && r.heldBy === "a");
  locks.releaseAll("a");
  assert.deepEqual(locks.acquire("b", "/repo/x.ts"), { ok: true });
});

test("path spelling does not matter (./ and separators collide)", () => {
  const locks = new LockManager();
  locks.acquire("a", "/repo/sub/x.ts");
  assert.equal(locks.heldBy("/repo/sub/../sub/x.ts"), "a");
});

test("releaseAll frees only that job's files", () => {
  const locks = new LockManager();
  locks.acquire("a", "/repo/a.ts");
  locks.acquire("b", "/repo/b.ts");
  locks.releaseAll("a");
  assert.equal(locks.heldBy("/repo/a.ts"), undefined);
  assert.equal(locks.heldBy("/repo/b.ts"), "b");
});
