/**
 * Live scenario for step 3 (calls the real model; spawns sub-agents; costs money).
 * A throwaway repo with a backend and a frontend file. In auto mode the main agent
 * should split the work into two parallel read-only explore jobs and summarise their
 * reports. Nothing here can write or reach outside the repo.
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

const repo = fs.mkdtempSync(path.join(os.tmpdir(), "orch-step3-"));
fs.mkdirSync(path.join(repo, "api"));
fs.mkdirSync(path.join(repo, "web"));
fs.writeFileSync(
  path.join(repo, "api", "users.ts"),
  `export function find(db, name){ return db.query("SELECT * FROM users WHERE name = '" + name + "'"); }\n`,
);
fs.writeFileSync(
  path.join(repo, "web", "Profile.tsx"),
  `export const Profile = ({ bio }) => <div dangerouslySetInnerHTML={{ __html: bio }} />;\n`,
);

const cfg = resolveConfig(
  {
    targetRepo: repo,
    models: { main: process.env.ORCH_MODEL ?? "claude-opus-5-5" },
    effort: "medium",
    jobs: { maxConcurrent: 3, models: { explore: "claude-sonnet-5-5" } },
    paths: { logs: path.join(repo, "_logs") },
  },
  path.join(ORCH_ROOT, "agent.config.ts"),
);
const gate = createPermissionGate(cfg, { ask: async () => false, getMode: () => "auto", logDir: cfg.paths.logs });

const tools: string[] = [];
const jobsDone: JobRecord[] = [];
const replies: string[] = [];

await new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timeout after 600s")), 600_000);
  const session = new MainSession(cfg, gate, "auto", {
    onText: (t) => replies.push(t),
    onToolUse: (name, input) => tools.push(`${name} ${JSON.stringify(input).slice(0, 120)}`),
    onTurnEnd: ({ costUsd, error }) => {
      if (error) console.log("turn error:", error);
      // Resolve once the main agent has gone quiet with both jobs reported.
      if (jobsDone.length >= 2) {
        clearTimeout(timer);
        console.log(`total cost $${costUsd.toFixed(4)}`);
        session.close();
        resolve();
      }
    },
    onBusyChange: () => {},
    onJobFinished: (r) => {
      jobsDone.push(r);
      console.log(`job ${r.id} ${r.status} $${r.costUsd.toFixed(4)}`);
    },
  });
  session.run().catch(reject);
  session.send(
    "Audit this repo for security bugs: the backend under api/ and the frontend under web/, at the same time. " +
      "Split it into two independent read-only explore sub-agents (one per area) and run them in parallel, then summarise their findings. Do not fix anything yet.",
  );
});

const spawns = tools.filter((t) => t.startsWith("spawn_agent") || t.includes("spawn_agent"));
console.log("\nTOOLS:\n  " + tools.join("\n  "));
console.log("\nFINAL REPLY:\n" + replies.slice(-1)[0]?.slice(0, 600));

assert.ok(spawns.length >= 2, `expected >=2 spawn_agent calls, saw ${spawns.length}`);
assert.ok(jobsDone.length >= 2, `expected >=2 finished jobs, saw ${jobsDone.length}`);
assert.ok(jobsDone.every((j) => j.status === "done"), "every job finished cleanly");
assert.ok(replies.join(" ").length > 0, "main agent produced a summary");
console.log("\nPASS step3 scenarios");
