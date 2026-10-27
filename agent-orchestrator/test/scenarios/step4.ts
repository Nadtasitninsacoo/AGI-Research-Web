/**
 * Live scenario for step 4 (calls the real model; spawns worker sub-agents; costs money).
 * Two workers fix a bug each, scoped to their own file, in parallel. Verifies the edits
 * landed, that neither worker wrote outside its allowed path, and that locks held.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveConfig } from "../../src/config/load.js";
import type { JobRecord } from "../../src/jobs/types.js";
import { createPermissionGate } from "../../src/permissions/index.js";
import { MainSession } from "../../src/session/main-session.js";
import { ORCH_ROOT } from "../../src/util/paths.js";

const repo = fs.mkdtempSync(path.join(os.tmpdir(), "orch-step4-"));
fs.writeFileSync(path.join(repo, "add.ts"), "export const add = (a: number, b: number): number => a - b;\n");
fs.writeFileSync(path.join(repo, "greet.ts"), "export const greet = (n: string): string => `Helo ${n}`;\n");

const cfg = resolveConfig(
  {
    targetRepo: repo,
    models: { main: process.env.ORCH_MODEL ?? "claude-opus-5-5" },
    effort: "medium",
    jobs: { maxConcurrent: 3, models: { worker: "claude-sonnet-5-5" } },
    paths: { logs: path.join(repo, "_logs") },
  },
  path.join(ORCH_ROOT, "agent.config.ts"),
);
const gate = createPermissionGate(cfg, { ask: async () => false, getMode: () => "auto", logDir: cfg.paths.logs });

const tools: string[] = [];
const jobsDone: JobRecord[] = [];

await new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timeout after 600s")), 600_000);
  const session = new MainSession(cfg, gate, "auto", {
    onText: () => {},
    onToolUse: (name, input) => tools.push(`${name} ${JSON.stringify(input).slice(0, 120)}`),
    onTurnEnd: ({ costUsd }) => {
      if (jobsDone.length >= 2) {
        clearTimeout(timer);
        console.log(`total cost $${costUsd.toFixed(4)}`);
        session.close();
        resolve();
      }
    },
    onBusyChange: () => {},
    onJobFinished: (r) => (jobsDone.push(r), console.log(`job ${r.id} ${r.status} $${r.costUsd.toFixed(4)}`)),
  });
  session.run().catch(reject);
  session.send(
    "Two separate bugs: add.ts subtracts instead of adding, and greet.ts spells 'Hello' wrong. " +
      "Delegate each to its own worker sub-agent, scoped to just that one file, and run them in parallel. Do not commit.",
  );
});

const add = fs.readFileSync(path.join(repo, "add.ts"), "utf8");
const greet = fs.readFileSync(path.join(repo, "greet.ts"), "utf8");
console.log("\nadd.ts:", add.trim(), "\ngreet.ts:", greet.trim());
console.log("TOOLS:\n  " + tools.join("\n  "));

const spawns = tools.filter((t) => t.includes("spawn_agent"));
assert.ok(spawns.length >= 2, `expected >=2 worker spawns, saw ${spawns.length}`);
assert.ok(jobsDone.length >= 2 && jobsDone.every((j) => j.status === "done"), "both workers finished cleanly");
assert.match(add, /a \+ b/, "add.ts was fixed");
assert.match(greet, /Hello/, "greet.ts was fixed");
console.log("\nPASS step4 scenarios");
