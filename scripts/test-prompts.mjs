// Queue the 8 acceptance test cases as runs for an agent, so the worker
// processes them and you can review each output against its expected behaviour
// on the dashboard (/runs) or in the worker log.
//   node --env-file=.env.local scripts/test-prompts.mjs [agent name]   (default: CERBERUS)
import mysql from "mysql2/promise";
import { TEST_CASES } from "../engine/src/prompts.mjs";

const agentName = process.argv[2] || "CERBERUS";

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
    console.error(`No agent named "${agentName}". Available: ${list.map((a) => a.name).join(", ")}`);
    process.exit(1);
  }

  let [[exp]] = await conn.query("SELECT id FROM experiments WHERE agent_id = ? ORDER BY id LIMIT 1", [agent.id]);
  if (!exp) {
    let [[proj]] = await conn.query("SELECT id FROM research_projects ORDER BY id LIMIT 1");
    if (!proj) {
      const [p] = await conn.query(
        "INSERT INTO research_projects (title, summary, status) VALUES ('Prompt QA','Acceptance tests','active')",
      );
      proj = { id: p.insertId };
    }
    const [e] = await conn.query(
      "INSERT INTO experiments (project_id, agent_id, name, status) VALUES (?,?,?,'planned')",
      [proj.id, agent.id, `QA-${agent.name}`],
    );
    exp = { id: e.insertId };
  }

  console.log(`Queuing ${TEST_CASES.length} test cases for "${agent.name}":`);
  for (const tc of TEST_CASES) {
    const [r] = await conn.query(
      "INSERT INTO experiment_runs (experiment_id, params, status) VALUES (?, ?, 'queued')",
      [exp.id, JSON.stringify({ prompt: tc.input, test_case: tc.name, expected: tc.expected })],
    );
    console.log(`  run #${r.insertId}  [${tc.name}]`);
  }
  console.log("\nStart the worker (npm run engine) and review each run's output vs its expected behaviour.");
} finally {
  await conn.end();
}
