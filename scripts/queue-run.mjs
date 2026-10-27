// Queue a run for the engine worker to pick up.
// Usage:
//   node --env-file=.env.local scripts/queue-run.mjs "<agent name>" "<prompt>"
//
// Creates a project/experiment for the agent if none exists yet, then inserts
// a queued experiment_runs row. The running worker claims it within ~2s.
import mysql from "mysql2/promise";

const [, , agentName, ...promptParts] = process.argv;
const prompt = promptParts.join(" ").trim();
if (!agentName || !prompt) {
  console.error('Usage: node --env-file=.env.local scripts/queue-run.mjs "<agent name>" "<prompt>"');
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 3306),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
});

try {
  const [[agent]] = await conn.query("SELECT id, name FROM agents WHERE name = ? LIMIT 1", [agentName]);
  if (!agent) {
    const [list] = await conn.query("SELECT name FROM agents ORDER BY name");
    console.error(`No agent named "${agentName}". Available: ${list.map((a) => a.name).join(", ") || "(none)"}`);
    process.exit(1);
  }

  let [[exp]] = await conn.query(
    "SELECT id FROM experiments WHERE agent_id = ? ORDER BY id LIMIT 1",
    [agent.id],
  );
  if (!exp) {
    let [[proj]] = await conn.query("SELECT id FROM research_projects ORDER BY id LIMIT 1");
    if (!proj) {
      const [p] = await conn.query(
        "INSERT INTO research_projects (title, summary, status) VALUES ('Engagements','Pentest engagements','active')",
      );
      proj = { id: p.insertId };
    }
    const [e] = await conn.query(
      "INSERT INTO experiments (project_id, agent_id, name, status) VALUES (?,?,?,'planned')",
      [proj.id, agent.id, `ENG-${agent.name}`],
    );
    exp = { id: e.insertId };
  }

  const [r] = await conn.query(
    "INSERT INTO experiment_runs (experiment_id, params, status) VALUES (?, ?, 'queued')",
    [exp.id, JSON.stringify({ prompt })],
  );
  console.log(`Queued run #${r.insertId} for agent "${agent.name}" (experiment #${exp.id}).`);
  console.log(`Watch the worker terminal, or open http://localhost:3000/runs/${r.insertId}`);
} finally {
  await conn.end();
}
