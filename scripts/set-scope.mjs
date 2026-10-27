// Set the authorized engagement scope on an agent (merged into agents.config).
// Usage:
//   node --env-file=.env.local scripts/set-scope.mjs "<agent name>" "<label>" <target> [more targets...]
// Example:
//   node --env-file=.env.local scripts/set-scope.mjs "CERBERUS" "SOW-2026-014" 10.10.10.0/24 *.lab.local
import mysql from "mysql2/promise";

const [, , agentName, label, ...targets] = process.argv;
if (!agentName || !label || targets.length === 0) {
  console.error('Usage: node --env-file=.env.local scripts/set-scope.mjs "<agent name>" "<label>" <target> [more...]');
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
  const [[agent]] = await conn.query("SELECT id, name, config FROM agents WHERE name = ? LIMIT 1", [agentName]);
  if (!agent) {
    const [list] = await conn.query("SELECT name FROM agents ORDER BY name");
    console.error(`No agent named "${agentName}". Available: ${list.map((a) => a.name).join(", ") || "(none)"}`);
    process.exit(1);
  }
  const cfg = agent.config && typeof agent.config === "object" ? agent.config : {};
  cfg.scope = { label, targets };
  await conn.query("UPDATE agents SET config = ? WHERE id = ?", [JSON.stringify(cfg), agent.id]);
  console.log(`Scope set on "${agent.name}":`);
  console.log(`  label:   ${label}`);
  console.log(`  targets: ${targets.join(", ")}`);
} finally {
  await conn.end();
}
