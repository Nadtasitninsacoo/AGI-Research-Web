// Wipe the demo/seed data and create one clean pentest agent for real use.
//
// DESTRUCTIVE: deletes all agents, projects, experiments, runs, logs, etc.
// Run only when you want a clean slate.
//   node --env-file=.env.local scripts/reset-demo.mjs
//
// Afterwards you have one agent "RECON-1" (model llama3.1, no scope yet).
// Set its scope with scripts/set-scope.mjs, then queue work with queue-run.mjs.
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 3306),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  multipleStatements: true,
});

try {
  // Delete in FK-dependency order (children first).
  const tables = [
    "agent_logs",
    "evaluations",
    "experiment_runs",
    "experiments",
    "datasets",
    "research_projects",
    "agents",
    "users",
  ];
  for (const t of tables) {
    const [r] = await conn.query(`DELETE FROM \`${t}\``);
    console.log(`cleared ${t} (${r.affectedRows} rows)`);
  }

  const [a] = await conn.query(
    "INSERT INTO agents (name, description, model, status, config) VALUES (?,?,?,?,?)",
    [
      "RECON-1",
      "Authorized pentest assistant (Ollama/Llama).",
      "llama3.1",
      "idle",
      JSON.stringify({ temperature: 0.2 }),
    ],
  );
  console.log(`\nCreated clean agent "RECON-1" (id ${a.insertId}, model llama3.1, no scope yet).`);
  console.log("Next:");
  console.log('  node --env-file=.env.local scripts/set-scope.mjs "RECON-1" "SOW-xxxx" 10.10.10.0/24 "*.lab.local"');
  console.log('  node --env-file=.env.local scripts/queue-run.mjs "RECON-1" "<your objective>"');
} finally {
  await conn.end();
}
