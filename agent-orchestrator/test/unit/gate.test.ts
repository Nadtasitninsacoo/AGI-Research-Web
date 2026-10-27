import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import type { HookInput } from "@anthropic-ai/claude-agent-sdk";
import type { Asker, PermissionRequest } from "../../src/permissions/index.js";
import { makeGate } from "./helpers.js";

const signal = new AbortController().signal;

const gate = (ask: Asker) => makeGate({ ask });

/** canUseTool with the options the SDK passes; its result is never null here. */
async function use(g: ReturnType<typeof gate>, tool: string, input: Record<string, unknown>) {
  const r = await g.canUseTool(tool, input, { signal, toolUseID: "t", requestId: "r" });
  assert.ok(r, "canUseTool returned no decision");
  return r;
}

const readLog = (file: string) =>
  fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, string>);

test("hook returns the engine's decision and logs non-ask outcomes", async () => {
  const g = gate(async () => true);
  const run = (command: string) =>
    g.hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, tool_use_id: "t" } as unknown as HookInput, "t", { signal });
  const out = (await run("git push --force origin main")) as { hookSpecificOutput: Record<string, string> };
  assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /Do not retry/);
  assert.equal(((await run("git status")) as typeof out).hookSpecificOutput.permissionDecision, "allow");
  assert.deepEqual(readLog(g.audit.file).map((e) => [e.ruleId, e.outcome]), [
    ["deny-force-push-protected", "auto"],
    ["allow-git-read", "auto"],
  ]);
});

test("ask goes to the user; a declined call is refused on repeat without asking again", async () => {
  const asked: PermissionRequest[] = [];
  const g = gate(async (req) => (asked.push(req), false));
  const input = { command: "git push origin main", description: "push" };

  const first = await use(g, "Bash", input);
  assert.equal(first.behavior, "deny");
  assert.match(first.behavior === "deny" ? first.message : "", /declined/);

  const second = await use(g, "Bash", { ...input, description: "push again" });
  assert.equal(second.behavior, "deny");
  assert.equal(asked.length, 1, "the user is asked only once");
  assert.equal(asked[0].ruleId, "ask-git-history");
  assert.deepEqual(readLog(g.audit.file).map((e) => e.outcome), ["user-deny", "repeat-deny"]);
});

test("approved ask is allowed and logged", async () => {
  const g = gate(async () => true);
  const r = await use(g, "Bash", { command: "git commit -m x" });
  assert.equal(r.behavior, "allow");
  assert.equal(readLog(g.audit.file)[0].outcome, "user-allow");
});

test("canUseTool never lets a denied call through, even if the user would say yes", async () => {
  const g = gate(async () => true);
  assert.equal((await use(g, "Bash", { command: "rm -rf /" })).behavior, "deny");
});

test("auto mode defers ask-actions without prompting and still blocks deny", async () => {
  let asked = 0;
  const g = makeGate({ mode: "auto", ask: async () => (asked++, true) });
  const deferred = await use(g, "Bash", { command: "git commit -m x" });
  assert.equal(deferred.behavior, "deny");
  assert.match(deferred.behavior === "deny" ? deferred.message : "", /deferred/i);
  assert.equal(asked, 0, "auto mode must not ask a human");
  assert.equal((await use(g, "Bash", { command: "rm -rf /" })).behavior, "deny");
  assert.equal((await use(g, "Read", { file_path: "src/app/page.tsx" })).behavior, "allow");
  // canUseTool logs only the ask path it handles; allow/deny are the hook's job in the real flow.
  assert.deepEqual(readLog(g.audit.file).map((e) => e.outcome), ["deferred"]);
});
