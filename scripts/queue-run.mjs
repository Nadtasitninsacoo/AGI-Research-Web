// Queue one run for the engine worker (engine/src/index.mjs) to pick up.
// Usage:
//   node --env-file=.env.local scripts/queue-run.mjs "<agent name>" "<prompt>"
//
// Queues EXACTLY the prompt given — nothing is appended to it, silently or
// otherwise. If you want the agent to behave a certain way, say so in the
// prompt itself; this script does not add instructions of its own.

import mysql from "mysql2/promise";

const [, , agentName, ...promptParts] = process.argv;
const prompt = promptParts.join(" ").trim();

if (!agentName || !prompt) {
  console.error('Usage: node --env-file=.env.local scripts/queue-run.mjs "<agent name>" "<prompt>"');
  process.exit(1);
}

async function queueRun() {
  // Same defaults as engine/src/config.mjs, so this script talks to the same
  // database the worker and the web app use, with no env vars set.
  const conn = await mysql.createConnection({
    host: process.env.DATABASE_HOST || "127.0.0.1",
    port: Number(process.env.DATABASE_PORT ?? 3306),
    database: process.env.DATABASE_NAME || "agi_research",
    user: process.env.DATABASE_USER || "agi_app",
    password: process.env.DATABASE_PASSWORD || "",
    connectTimeout: 5000,
  });

  try {
    const [[agent]] = await conn.query("SELECT id, name FROM agents WHERE name = ? LIMIT 1", [agentName]);
    if (!agent) {
      const [list] = await conn.query("SELECT name FROM agents ORDER BY name");
      console.error(`No agent named "${agentName}". Available: ${list.map((a) => a.name).join(", ") || "(none)"}`);
      process.exitCode = 1;
      return;
    }

    let [[exp]] = await conn.query(
      "SELECT id FROM experiments WHERE agent_id = ? ORDER BY id LIMIT 1",
      [agent.id],
    );

    if (!exp) {
      let [[proj]] = await conn.query("SELECT id FROM research_projects ORDER BY id LIMIT 1");
      if (!proj) {
        const [p] = await conn.query(
          "INSERT INTO research_projects (title, summary, status) VALUES (?, ?, 'active')",
          ["Default project", "Auto-created by queue-run.mjs"],
        );
        proj = { id: p.insertId };
      }
      const [e] = await conn.query(
        "INSERT INTO experiments (project_id, agent_id, name, status) VALUES (?,?,?,'planned')",
        [proj.id, agent.id, `run-${agent.name}`],
      );
      exp = { id: e.insertId };
    }

    const [r] = await conn.query(
      "INSERT INTO experiment_runs (experiment_id, params, status) VALUES (?, ?, 'queued')",
      [exp.id, JSON.stringify({ prompt })],
    );

    console.log(`Queued run #${r.insertId} for agent "${agent.name}" (experiment #${exp.id}).`);
    console.log(`Dashboard: http://localhost:4000/runs/${r.insertId}`);
  } finally {
    await conn.end();
  }
}

queueRun().catch((err) => {
  // Report the real failure — never claim a run was queued when it wasn't.
  console.error("Failed to queue run:", err?.message ?? err);
  process.exitCode = 1;
});
