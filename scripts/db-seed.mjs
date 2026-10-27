// Inserts demo data so the dashboard has something to show. Only runs on an empty database.
// Usage: npm run db:seed
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 3306),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
});

const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM agents");
if (n > 0) {
  console.log("Database already has agents; skipping seed.");
  await conn.end();
  process.exit(0);
}

const [u] = await conn.query(
  "INSERT INTO users (email, display_name, role) VALUES ('admin@agi.local','Overseer','admin')",
);
const owner = u.insertId;

const agentDefs = [
  ["ORACLE-7", "Long-horizon planning & reasoning", "claude-fable-5-1", "running"],
  ["WRAITH", "Autonomous code synthesis", "claude-opus-5-5", "running"],
  ["HYDRA", "Multi-agent coordination", "claude-sonnet-5-5", "idle"],
  ["CERBERUS", "Red-team & safety probing", "claude-opus-5-5", "paused"],
  ["NEMESIS", "Self-play adversarial learning", "claude-haiku-5-5", "error"],
];
const agentIds = [];
for (const [name, description, model, status] of agentDefs) {
  const [r] = await conn.query(
    "INSERT INTO agents (name, description, model, status, config, created_by) VALUES (?,?,?,?,?,?)",
    [name, description, model, status, JSON.stringify({ temperature: 0.7 }), owner],
  );
  agentIds.push(r.insertId);
}

const projectDefs = [
  ["Project BLACKOUT", "Reasoning under adversarial pressure", "active"],
  ["Project IRONCLAD", "Alignment & containment evaluation", "active"],
  ["Project GENESIS", "Open-ended skill acquisition", "draft"],
];
const projectIds = [];
for (const [title, summary, status] of projectDefs) {
  const [r] = await conn.query(
    "INSERT INTO research_projects (title, summary, status, owner_id) VALUES (?,?,?,?)",
    [title, summary, status, owner],
  );
  projectIds.push(r.insertId);
}

const [d] = await conn.query(
  "INSERT INTO datasets (name, version, description) VALUES ('ARC-Hard','2','Abstraction & reasoning corpus')",
);

const benchmarks = ["ARC-AGI", "MMLU-Pro", "SWE-Bench", "GPQA", "HLE"];
const rnd = (() => {
  let s = 1337;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();

for (let i = 0; i < 10; i++) {
  const agentIdx = i % agentIds.length;
  const [e] = await conn.query(
    "INSERT INTO experiments (project_id, agent_id, dataset_id, name, hypothesis, status) VALUES (?,?,?,?,?,?)",
    [
      projectIds[i % projectIds.length],
      agentIds[agentIdx],
      d.insertId,
      `EXP-${String(i + 1).padStart(3, "0")}`,
      "Scaling test-time compute improves abstraction transfer.",
      i % 4 === 3 ? "failed" : i % 3 === 0 ? "running" : "completed",
    ],
  );
  for (let k = 0; k < 3; k++) {
    const roll = rnd();
    const status = roll > 0.8 ? "failed" : roll > 0.7 ? "running" : roll > 0.65 ? "queued" : "succeeded";
    const accuracy = +(0.5 + rnd() * 0.45).toFixed(3);
    const [r] = await conn.query(
      "INSERT INTO experiment_runs (experiment_id, params, metrics, status, started_at, created_at) VALUES (?,?,?,?, NOW() - INTERVAL ? MINUTE, NOW() - INTERVAL ? MINUTE)",
      [
        e.insertId,
        JSON.stringify({ seed: i * 10 + k }),
        JSON.stringify({ accuracy }),
        status,
        i * 17 + k * 5,
        i * 17 + k * 5,
      ],
    );
    if (status === "succeeded") {
      const b = benchmarks[(i + k) % benchmarks.length];
      await conn.query("INSERT INTO evaluations (run_id, benchmark, score) VALUES (?,?,?)", [r.insertId, b, accuracy]);
    }
    const level = status === "failed" ? "error" : status === "queued" ? "warn" : "info";
    await conn.query("INSERT INTO agent_logs (agent_id, run_id, level, message, created_at) VALUES (?,?,?,?, NOW() - INTERVAL ? MINUTE)", [
      agentIds[agentIdx],
      r.insertId,
      level,
      `run #${r.insertId} ${status} (accuracy ${accuracy})`,
      i * 17 + k * 5,
    ]);
  }
}

console.log("Seeded demo data.");
await conn.end();
