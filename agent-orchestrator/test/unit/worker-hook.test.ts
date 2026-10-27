import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import type { HookInput } from "@anthropic-ai/claude-agent-sdk";
import { createExploreHook, createWorkerHook } from "../../src/jobs/job-hook.js";
import { LockManager } from "../../src/jobs/locks.js";
import { createEngine } from "../../src/permissions/engine.js";
import { REPO, testConfig } from "./helpers.js";

const engine = createEngine(testConfig());
const signal = new AbortController().signal;

function run(hook: ReturnType<typeof createExploreHook>, tool_name: string, tool_input: Record<string, unknown>) {
  return hook({ hook_event_name: "PreToolUse", tool_name, tool_input, tool_use_id: "t" } as unknown as HookInput, "t", { signal }) as Promise<{
    hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
  }>;
}
const decision = async (...a: Parameters<typeof run>) => (await run(...a)).hookSpecificOutput?.permissionDecision;
const abs = (p: string) => path.join(REPO, p);

test("explore hook allows reads, denies secrets, and denies ask-level actions", async () => {
  const h = createExploreHook(engine);
  assert.equal(await decision(h, "Read", { file_path: abs("src/app/page.tsx") }), "allow");
  assert.equal(await decision(h, "Read", { file_path: abs(".env.local") }), "deny");
  // git commit is ask-level for the main agent; inside a job it becomes a deny.
  const r = await run(h, "Bash", { command: "git commit -m x" });
  assert.equal(r.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(r.hookSpecificOutput?.permissionDecisionReason ?? "", /human|background job/i);
});

test("worker hook confines writes to the brief's allowedPaths", async () => {
  const h = createWorkerHook(engine, "worker-1", ["src/lib/**"], new LockManager(), REPO);
  assert.equal(await decision(h, "Edit", { file_path: abs("src/lib/api.ts") }), "allow");
  const out = await run(h, "Write", { file_path: abs("src/app/page.tsx") });
  assert.equal(out.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(out.hookSpecificOutput?.permissionDecisionReason ?? "", /outside your allowed paths/);
  // reads are not confined to allowedPaths — a worker may read anywhere non-secret.
  assert.equal(await decision(h, "Read", { file_path: abs("src/app/page.tsx") }), "allow");
});

test("worker hook refuses a file another job has locked, and keeps its own", async () => {
  const locks = new LockManager();
  const a = createWorkerHook(engine, "job-a", ["src/**"], locks, REPO);
  const b = createWorkerHook(engine, "job-b", ["src/**"], locks, REPO);
  assert.equal(await decision(a, "Edit", { file_path: abs("src/lib/db.ts") }), "allow"); // a takes the lock
  assert.equal(await decision(a, "Edit", { file_path: abs("src/lib/db.ts") }), "allow"); // a may edit it again
  const blocked = await run(b, "Edit", { file_path: abs("src/lib/db.ts") });
  assert.equal(blocked.hookSpecificOutput?.permissionDecision, "deny");
  assert.match(blocked.hookSpecificOutput?.permissionDecisionReason ?? "", /locked by job job-a/);

  locks.releaseAll("job-a");
  assert.equal(await decision(b, "Edit", { file_path: abs("src/lib/db.ts") }), "allow"); // freed after a ended
});

test("worker hook still blocks secret writes and escapes from the repo", async () => {
  const h = createWorkerHook(engine, "w", ["**"], new LockManager(), REPO);
  assert.equal(await decision(h, "Write", { file_path: abs(".env.local") }), "deny");
  assert.equal(await decision(h, "Write", { file_path: path.resolve(REPO, "../outside.ts") }), "deny");
});
