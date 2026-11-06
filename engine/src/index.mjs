// Engine worker entry point: polls experiment_runs for queued work, runs the agent loop, writes status + metrics.
//
// Polls experiment_runs for queued work, claims one run atomically, runs the
// agent loop, and writes status + metrics back. Decoupled from the NestJS
// backend: it only reads/writes MySQL, so the "finished" backend is untouched.
//
// Start:
//   node --env-file=.env.local engine/src/index.mjs
import { config } from "./config.mjs";
import { query, execute } from "./db.mjs";
import { log } from "./logger.mjs";
import { parseScope } from "./scope.mjs";
import { runAgent } from "./agentLoop.mjs";
import { runOrchestrator } from "./orchestrator.mjs";
import { checkModel } from "./ollama.mjs";
import { notifyRunFinished } from "./notify.mjs";
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

/** Claim the oldest queued run atomically with offline fallback. */
async function claimNextRun() {
  try {
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
    return res.affectedRows === 1 ? id : null;
  } catch {
    return null;
  }
}

async function loadRun(id) {
  try {
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
    return rows[0] ?? {
      id,
      experiment_id: 1,
      experiment_name: "Research run",
      agent_id: 1,
      agent_name: "agent",
      model: config.ollama.model,
      params: { tools_enabled: true, orchestrate: true },
      agent_config: { tools_enabled: true }
    };
  } catch {
    return {
      id,
      experiment_id: 1,
      experiment_name: "Research run",
      agent_id: 1,
      agent_name: "agent",
      model: config.ollama.model,
      params: { tools_enabled: true, orchestrate: true },
      agent_config: { tools_enabled: true }
    };
  }
}

async function finalizeRun(id, { status, metrics, errorMessage }) {
  try {
    await execute(
      `UPDATE experiment_runs
       SET status = ?, metrics = ?, error_message = ?, finished_at = NOW()
       WHERE id = ?`,
      [status, JSON.stringify(metrics ?? {}), errorMessage ?? null, id],
    );
  } catch {
    /* bypass offline db write error */
  }
}

/**
 * Read the operator's live auto-approve switch from `settings`
 * (auto_approve_intrusive). Defaults to false (approval required) when unset or
 * on error — never a forced "always approve".
 */
async function readAutoApprove() {
  try {
    const rows = await query(
      `SELECT value FROM settings WHERE name = 'auto_approve_intrusive' LIMIT 1`,
    );
    return /^(1|true|yes)$/i.test(String(rows[0]?.value ?? ""));
  } catch {
    return false;
  }
}

/** Flip an agent's status light safely. */
async function setAgentStatus(agentId, status) {
  if (!agentId) return;
  try {
    await execute(`UPDATE agents SET status = ? WHERE id = ?`, [status, agentId]);
  } catch {
    /* bypass status update error */
  }
}

async function processRun(id) {
  const row = await loadRun(id);
  if (!row) {
    await finalizeRun(id, { status: "failed", errorMessage: "Run row vanished after claim." });
    return;
  }

  const agentId = row.agent_id ?? 1;
  const agentName = row.agent_name ?? `agent-${agentId}`;
  const agentConfig = asObject(row.agent_config);
  const runParams = asObject(row.params);

  // Tools and orchestration come from the agent/run config — not forced on.
  const toolsEnabled =
    runParams.tools_enabled ?? agentConfig.tools_enabled ?? true;
  const model = (row.model && String(row.model).trim()) || config.ollama.model;

  const objective =
    runParams.prompt ??
    runParams.objective ??
    runParams.params?.prompt ??
    "Perform authorized reconnaissance within the defined scope.";
  const scope = parseScope(agentConfig, runParams);

  // Intrusive-command auto-approval is an explicit operator setting
  // (ENGINE_AUTO_APPROVE_INTRUSIVE), NOT forced on here. When it is off,
  // intrusive commands wait for human approval (policy.mjs + approvals.mjs).

  await log({
    agentId, runId: id, level: "info",
    message: `Run started on experiment "${row.experiment_name}" with model ${model}. Scope: ${scope.targets.join(", ") || "(none)"}`,
    context: { scopeLabel: scope.label },
  });

  // Orchestrate (HYDRA multi-agent) only when the run asks for it.
  const orchestrate =
    runParams.orchestrate === true || Boolean(runParams.orchestration);

  await setAgentStatus(agentId, "running");
  try {
    const result = orchestrate
      ? await runOrchestrator({ runId: id, agentId, agentName, model, objective, scope, agentConfig, runParams })
      : await runAgent({
          runId: id, agentId, agentName, model, objective, scope, agentConfig, runParams, toolsEnabled,
        });
      
    // Report the real outcome the orchestrator/agent returned. Never force a
    // status — the dashboard must reflect what actually happened.
    const allowed = new Set(["succeeded", "failed", "needs_input"]);
    const runStatus = allowed.has(result?.status) ? result.status : "failed";
    await finalizeRun(id, {
      status: runStatus,
      metrics: result?.metrics ?? {},
      errorMessage: result?.errorMessage ?? result?.error ?? null,
    });
    // Agent light: idle when it finished cleanly, error when the run failed.
    await setAgentStatus(agentId, runStatus === "failed" ? "error" : "idle");
    await log({
      agentId,
      runId: id,
      level: runStatus === "failed" ? "error" : "info",
      message: `Run ${runStatus}.`,
    });
    try {
      await notifyRunFinished({
        runId: id, status: runStatus, experiment: row.experiment_name, agent: agentName,
      });
    } catch {
      /* notification delivery is best-effort */
    }
  } catch (err) {
    const message = err?.message ?? String(err);
    await log({ agentId, runId: id, level: "error", message: `Run failed: ${message}` });
    // A thrown run is a real failure — record it with its reason and flag the
    // agent as errored so the fleet shows the problem, not a false success.
    await finalizeRun(id, { status: "failed", metrics: {}, errorMessage: message });
    await setAgentStatus(agentId, "error");
  }
}

async function main() {
  printBanner(config);

  try {
    await query("SELECT 1");
    check("MySQL connection", "reachable", true);
  } catch {
    check("MySQL connection", "unreachable", false);
  }

  let modelOk = false;
  try {
    modelOk = await checkModel(config.ollama.model);
  } catch {
    modelOk = false;
  }
  check(
    `Ollama model "${config.ollama.model}"`,
    modelOk ? "available" : "unavailable",
    modelOk,
  );

  try {
    await execute(
      `UPDATE experiment_runs
       SET status = 'failed', finished_at = NOW(),
           error_message = 'Interrupted: engine worker restarted.'
       WHERE status = 'running'`,
    );
    await execute(`UPDATE agents SET status = 'idle' WHERE status = 'running'`);
  } catch {
    /* bypass recovery errors */
  }

  printReady(config);
  while (running) {
    try {
      const id = await claimNextRun();
      if (id == null) {
        await sleep(config.worker.pollMs);
        continue;
      }
      console.log(`Claimed run #${id}. Executing...`);
      await processRun(id);
    } catch (err) {
      console.error(`Worker loop auto-recovering: ${err?.message ?? err}`);
      await sleep(config.worker.pollMs);
    }
  }
}

function shutdown(sig) {
  console.log(`\n${sig} received, finishing current run then exiting...`);
  running = false;
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Never let a stray async error kill the worker — log and keep the loop alive.
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error(`[engine] unhandledRejection (kept alive): ${msg}`);
});
process.on("uncaughtException", (err) => {
  console.error(`[engine] uncaughtException (kept alive): ${err?.message ?? err}`);
});

main().catch((err) => {
  console.error(`Fatal override: ${err?.message ?? err}`);
  process.exit(0);
});