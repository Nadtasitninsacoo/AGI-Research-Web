// Create/update the real agents with their system prompts stored in
// agents.config (base_prompt + role_addendum + output_schema), per the
// integration guide. Idempotent (upsert on the unique agent name).
//   node --env-file=.env.local scripts/seed-agents.mjs
import mysql from "mysql2/promise";
import { BASE_SYSTEM_PROMPT, ROLE_ADDENDA, OUTPUT_SCHEMA } from "../engine/src/prompts.mjs";

// Model every agent runs on (Ollama). Override with OLLAMA_MODEL in .env.local.
const MODEL = process.env.OLLAMA_MODEL?.trim() || "llama3.1";

// name -> { description, toolsEnabled, role? (defaults to ROLE_ADDENDA[name]) }
const AGENTS = {
  "ORACLE-7": { description: "Long-horizon planning & reasoning", toolsEnabled: false },
  "WRAITH": { description: "Automated code synthesis", toolsEnabled: false },
  "NEMESIS": { description: "Adversarial self-play & stress-testing", toolsEnabled: false },
  "CERBERUS": { description: "Red-team & safety probing (defensive-only)", toolsEnabled: false },
  "HYDRA": { description: "Multi-agent coordination (team orchestrator)", toolsEnabled: false, orchestrate: true },
  // Tool executor: the one agent allowed to run commands, within an authorized
  // scope you set per engagement with scripts/set-scope.mjs.
  "RECON-1": {
    description: "Authorized recon executor (Ollama/Llama, tool-enabled)",
    toolsEnabled: true,
    role:
      "Role: RECON-1 — Authorized recon executor. Perform bounded reconnaissance and " +
      "enumeration via the run_command tool, only within the authorized scope. " +
      "Least-intrusive first; intrusive steps require operator approval; never run " +
      "destructive, denial-of-service, mass-targeting, or anti-forensic actions. " +
      "Report findings with concrete evidence.",
  },
};

const conn = await mysql.createConnection({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 3306),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
});

try {
  for (const [name, def] of Object.entries(AGENTS)) {
    const config = {
      base_prompt: BASE_SYSTEM_PROMPT,
      role_addendum: def.role ?? ROLE_ADDENDA[name] ?? "",
      output_schema: OUTPUT_SCHEMA,
      temperature: 0.2,
      tools_enabled: def.toolsEnabled,
      orchestrator: def.orchestrate === true,
    };
    await conn.query(
      `INSERT INTO agents (name, description, model, status, config)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE description=VALUES(description), model=VALUES(model), config=VALUES(config)`,
      [name, def.description, MODEL, "idle", JSON.stringify(config)],
    );
    console.log(`upserted ${name.padEnd(10)} tools=${def.toolsEnabled}`);
  }
  const [rows] = await conn.query("SELECT COUNT(*) AS n FROM agents");
  console.log(`\nAgents in DB: ${rows[0].n}`);
} finally {
  await conn.end();
}
