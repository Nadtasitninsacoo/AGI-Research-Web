// Engine worker entry point.
//
// Polls experiment_runs for queued work, claims one run atomically, runs the
// agent loop, and writes status + metrics back. Decoupled from the NestJS
// backend: it only reads/writes MySQL, so the "finished" backend is untouched.
//
// Start:
//   node --env-file=.env.local engine/src/index.mjs
import { config } from "./config.mjs";
import { db, query, execute } from "./db.mjs";
import { log } from "./logger.mjs";
import { parseScope } from "./scope.mjs";
import { runAgent } from "./agentLoop.mjs";
import { runOrchestrator } from "./orchestrator.mjs";
import { checkModel } from "./ollama.mjs";
import { printBanner, check, printReady } from "./banner.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let running = true;

/** mysql2 usually returns JSON columns parsed; be defensive if it returns text. */
function asObject(value) {
  if (value == null) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

/** Claim the oldest queued run atomically. Returns its id, or null. */
async function claimNextRun() {
  const rows = await query(
    `SELECT id FROM experiment_runs WHERE status = 'queued' ORDER BY id ASC LIMIT 1`,
  );
  if (!rows.length) return null;
  const id = rows[0].id;
  const res = await execute(
    `UPDATE experiment_runs SET status = 'running', started_at = NOW()
     WHERE id = ? AND status = 'queued'`,
    [id],
  );
  return res.affectedRows === 1 ? id : null; // lost the race -> try again next tick
}

async function loadRun(id) {
  const rows = await query(
    `SELECT r.id, r.experiment_id, r.params,
            e.name  AS experiment_name, e.agent_id,
            a.name  AS agent_name, a.model, a.config AS agent_config
     FROM experiment_runs r
     JOIN experiments e ON e.id = r.experiment_id
     LEFT JOIN agents a ON a.id = e.agent_id
     WHERE r.id = ?`,
    [id],
  );
  return rows[0] ?? null;
}

async function finalizeRun(id, { status, metrics, errorMessage }) {
  await execute(
    `UPDATE experiment_runs
     SET status = ?, metrics = ?, error_message = ?, finished_at = NOW()
     WHERE id = ?`,
    [status, JSON.stringify(metrics ?? {}), errorMessage ?? null, id],
  );
}

/** Flip an agent's status light (agents.status) so the registry shows who is
 *  working. 'error' on a failed run, else back to 'idle'. Never throws. */
async function setAgentStatus(agentId, status) {
  if (!agentId) return;
  try {
    await execute(`UPDATE agents SET status = ? WHERE id = ?`, [status, agentId]);
  } catch (err) {
    console.error(`Failed to set agent #${agentId} status=${status}: ${err?.message ?? err}`);
  }
}

async function processRun(id) {
  const row = await loadRun(id);
  if (!row) {
    await finalizeRun(id, { status: "failed", errorMessage: "Run row vanished after claim." });
    return;
  }

  const agentId = row.agent_id ?? null;
  const agentName = row.agent_name ?? null;
  const agentConfig = asObject(row.agent_config);
  const runParams = asObject(row.params);
  // Tools are off by default (text-only research agents). An agent opts in with
  // config.tools_enabled = true, or a run can request it via params.tools_enabled.
  const toolsEnabled = runParams.tools_enabled === true || agentConfig.tools_enabled === true;
  let model = (row.model && String(row.model).trim()) || config.ollama.model;
  // Agents may store a non-Ollama model name (e.g. a Claude id from the demo
  // seed). This engine runs on Ollama, so fall back to the configured local
  // model when the requested one is not available.
  const modelStatus = await checkModel(model);
  if (modelStatus !== "ok") {
    await log({
      agentId, runId: id, level: "warn",
      message: `Model "${model}" is not available in Ollama (${modelStatus}). Falling back to "${config.ollama.model}".`,
    });
    model = config.ollama.model;
  }
  const objective =
    runParams.prompt ?? runParams.objective ?? runParams.params?.prompt ?? "(no prompt provided)";
  const scope = parseScope(agentConfig, runParams);

  await log({
    agentId, runId: id, level: "info",
    message: `Run started on experiment "${row.experiment_name}" with model ${model}. Scope: ${scope.targets.join(", ") || "(none)"}`,
    context: { scopeLabel: scope.label },
  });

  // Orchestrate (team mode) when HYDRA runs, or when explicitly requested.
  const orchestrate =
    runParams.orchestrate === true || agentConfig.orchestrator === true || agentName === "HYDRA";

  // Light up the agent in the registry while its run is in flight.
  await setAgentStatus(agentId, "running");
  try {
    const result = orchestrate
      ? await runOrchestrator({ runId: id, agentId, agentName, model, objective, scope, agentConfig, runParams })
      : await runAgent({
          runId: id, agentId, agentName, model, objective, scope, agentConfig, runParams, toolsEnabled,
        });
    await finalizeRun(id, {
      status: result.status,
      metrics: result.metrics,
      errorMessage: result.status === "failed" ? result.summary.slice(0, 2000) : null,
    });
    await setAgentStatus(agentId, result.status === "failed" ? "error" : "idle");
    await log({ agentId, runId: id, level: "info", message: `Run ${result.status}.` });
  } catch (err) {
    const message = err?.message ?? String(err);
    await log({ agentId, runId: id, level: "error", message: `Run crashed: ${message}` });
    await finalizeRun(id, { status: "failed", metrics: {}, errorMessage: message.slice(0, 2000) });
    await setAgentStatus(agentId, "error");
  }
}

async function main() {
  printBanner(config);

  // Fail-safe: verify the DB connection before entering the loop.
  try {
    await query("SELECT 1");
    check("MySQL connection", "reachable", true);
  } catch (err) {
    check("MySQL connection", `access denied / unreachable`, false);
    console.error(`    ${config.db.host}:${config.db.port}/${config.db.database} — ${err?.message ?? err}`);
    process.exit(1);
  }

  const modelStatus = await checkModel(config.ollama.model);
  check(
    `Ollama model "${config.ollama.model}"`,
    modelStatus === "ok" ? "available" : modelStatus,
    modelStatus === "ok",
  );

  // Recovery sweep: a run still 'running' at startup means a previous worker
  // died mid-run. With a single worker, nothing legitimate is running now, so
  // mark these interrupted instead of leaving them stuck forever. 'queued' runs
  // are left untouched and picked up normally (no duplicate work).
  try {
    const rec = await execute(
      `UPDATE experiment_runs
       SET status = 'failed', finished_at = NOW(),
           error_message = 'Interrupted: the engine worker restarted while this run was in progress.'
       WHERE status = 'running'`,
    );
    if (rec.affectedRows > 0) {
      check("Recovery sweep", `${rec.affectedRows} interrupted run(s) -> failed`, true);
    }
    // With a single worker, no agent is legitimately 'running' at startup — clear
    // stale status lights left by a previous crash.
    await execute(`UPDATE agents SET status = 'idle' WHERE status = 'running'`);
  } catch (err) {
    console.error(`Recovery sweep failed: ${err?.message ?? err}`);
  }

  printReady(config);
  while (running) {
    try {
      const id = await claimNextRun();
      if (id == null) {
        await sleep(config.worker.pollMs);
        continue;
      }
      console.log(`Claimed run #${id}.`);
      await processRun(id);
    } catch (err) {
      console.error(`Worker loop error: ${err?.message ?? err}`);
      await sleep(config.worker.pollMs);
    }
  }
}

function shutdown(sig) {
  console.log(`\n${sig} received, finishing current tick then exiting...`);
  running = false;
  setTimeout(() => db.end().finally(() => process.exit(0)), 500);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((err) => {
  console.error(`Fatal: ${err?.message ?? err}`);
  process.exit(1);
});
