
import { config } from "./config.mjs";
import { query, execute } from "./db.mjs";
import { log } from "./logger.mjs";
import { parseScope } from "./scope.mjs";
import { runAgent } from "./agentLoop.mjs";
import { runOrchestrator } from "./orchestrator.mjs";
import { checkModel } from "./ollama.mjs";
import { notifyRunFinished } from "./notify.mjs";
import { printBanner, check, printReady } from "./banner.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let running = true;
let currentRunId = null;
let shutdownSignal = null;

const RUN_STATUSES = new Set([
  "succeeded",
  "failed",
  "needs_input",
]);

const TASK_STATUS = {
  RUNNING: "running",
  IDLE: "idle",
  ERROR: "error",
};

/**
 * Safely parse database JSON values.
 */
function asObject(value) {
  if (value == null) return {};

  if (
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed;
      }
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Normalize execution status.
 * Never assume success when the result is ambiguous.
 */
function normalizeRunStatus(result) {
  const status = String(
    result?.status ?? result?.runStatus ?? "",
  ).toLowerCase();

  if (RUN_STATUSES.has(status)) {
    return status;
  }

  if (result?.success === true) {
    return "succeeded";
  }

  if (result?.success === false) {
    return "failed";
  }

  return "needs_input";
}

/**
 * Log without allowing telemetry failure to hide
 * the original execution error.
 */
async function safeLog(entry) {
  try {
    await log(entry);
  } catch (err) {
    console.error(
      "[Logger Error]",
      err?.message ?? String(err),
    );
  }
}

/**
 * Claim one queued run.
 *
 * The conditional UPDATE ensures that only one worker
 * can successfully claim a particular run.
 *
 * This does not require changing the existing schema.
 */
async function claimNextRun() {
  const rows = await query(
    `SELECT id
     FROM experiment_runs
     WHERE status = 'queued'
     ORDER BY id ASC
     LIMIT 1`,
  );

  if (!rows.length) return null;

  const id = rows[0].id;

  const result = await execute(
    `UPDATE experiment_runs
     SET status = 'running',
         started_at = NOW()
     WHERE id = ?
       AND status = 'queued'`,
    [id],
  );

  return result?.affectedRows === 1 ? id : null;
}

/**
 * Load a real run and its associated agent.
 *
 * Database failures are propagated.
 * Missing records are not replaced with fabricated data.
 */
async function loadRun(id) {
  const rows = await query(
    `SELECT
       r.id,
       r.experiment_id,
       r.params,
       e.name AS experiment_name,
       e.agent_id,
       a.name AS agent_name,
       a.model,
       a.config AS agent_config
     FROM experiment_runs r
     JOIN experiments e
       ON e.id = r.experiment_id
     LEFT JOIN agents a
       ON a.id = e.agent_id
     WHERE r.id = ?
     LIMIT 1`,
    [id],
  );

  return rows[0] ?? null;
}

/**
 * Persist final run state.
 *
 * Throws when the database cannot confirm the update.
 */
async function finalizeRun(
  id,
  {
    status,
    metrics = {},
    errorMessage = null,
  },
) {
  if (!RUN_STATUSES.has(status)) {
    throw new Error(`Invalid run status: ${status}`);
  }

  const result = await execute(
    `UPDATE experiment_runs
     SET status = ?,
         metrics = ?,
         error_message = ?,
         finished_at = NOW()
     WHERE id = ?
       AND status = 'running'`,
    [
      status,
      JSON.stringify(metrics ?? {}),
      errorMessage
        ? String(errorMessage).slice(0, 4000)
        : null,
      id,
    ],
  );

  if (result?.affectedRows !== 1) {
    throw new Error(
      `Could not finalize run ${id}. ` +
      `Expected one running row, updated ${result?.affectedRows ?? 0}.`,
    );
  }
}

/**
 * Update agent status.
 */
async function setAgentStatus(agentId, status) {
  if (!agentId) return;

  await execute(
    `UPDATE agents
     SET status = ?
     WHERE id = ?`,
    [status, agentId],
  );
}

/**
 * Determine the run's actual execution result.
 */
function getObjective(runParams) {
  return (
    runParams.prompt ??
    runParams.objective ??
    runParams.params?.prompt ??
    "Perform the configured research task."
  );
}

/**
 * Process one claimed run.
 */
async function processRun(id) {
  currentRunId = id;

  let row = null;
  let agentId = null;
  let agentName = "unknown-agent";

  try {
    row = await loadRun(id);

    if (!row) {
      throw new Error(
        `Run ${id} was claimed but its database record could not be loaded.`,
      );
    }

    agentId = row.agent_id ?? null;
    agentName = row.agent_name ?? `agent-${agentId ?? "unknown"}`;

    if (!agentId) {
      throw new Error(
        `Run ${id} does not have a valid associated agent.`,
      );
    }

    const agentConfig = asObject(row.agent_config);
    const runParams = asObject(row.params);

    const toolsEnabled =
      runParams.tools_enabled ??
      agentConfig.tools_enabled ??
      true;

    const model =
      row.model && String(row.model).trim()
        ? String(row.model).trim()
        : config.ollama.model;

    const objective = getObjective(runParams);

    // Use the configured scope.
    // Do not silently expand it to global network access.
    const scope = parseScope(agentConfig, runParams);

    // Respect the configured orchestration setting.
    const orchestrate =
      runParams.orchestrate ??
      agentConfig.orchestrate ??
      false;

    await safeLog({
      agentId,
      runId: id,
      level: "info",
      message: `Run started: ${row.experiment_name}`,
      context: {
        model,
        orchestrate,
        toolsEnabled,
        scopeLabel: scope?.label ?? null,
        scopeTargets: scope?.targets ?? [],
      },
    });

    await setAgentStatus(
      agentId,
      TASK_STATUS.RUNNING,
    );

    let result;

    if (orchestrate) {
      result = await runOrchestrator({
        runId: id,
        agentId,
        agentName,
        model,
        objective,
        scope,
        agentConfig,
        runParams: {
          ...runParams,
          autoApproveIntrusive: false,
        },
        toolsEnabled,
      });
    } else {
      result = await runAgent({
        runId: id,
        agentId,
        agentName,
        model,
        objective,
        scope,
        agentConfig,
        runParams: {
          ...runParams,
          autoApproveIntrusive: false,
        },
        toolsEnabled,
      });
    }

    const status = normalizeRunStatus(result);

    const metrics = {
      ...(result?.metrics ?? {}),
      worker: {
        model,
        orchestrated: Boolean(orchestrate),
        toolsEnabled: Boolean(toolsEnabled),
      },
    };

    const errorMessage =
      status === "failed"
        ? result?.error ?? result?.message ?? "Agent execution failed."
        : null;

    await finalizeRun(id, {
      status,
      metrics,
      errorMessage,
    });

    await setAgentStatus(
      agentId,
      status === "failed"
        ? TASK_STATUS.ERROR
        : TASK_STATUS.IDLE,
    );

    await safeLog({
      agentId,
      runId: id,
      level: status === "failed" ? "error" : "info",
      message: `Run finished with status: ${status}`,
      context: {
        status,
        metrics,
      },
    });

    try {
      await notifyRunFinished({
        runId: id,
        status,
        experiment: row.experiment_name,
        agent: agentName,
      });
    } catch (err) {
      console.error(
        `[Notification Error] Run ${id}:`,
        err?.message ?? String(err),
      );
    }

  } catch (err) {
    const message = err?.message ?? String(err);

    console.error(
      `[Run ${id} Error]`,
      message,
    );

    await safeLog({
      agentId,
      runId: id,
      level: "error",
      message: `Run failed: ${message}`,
    });

    // Record the actual failure.
    // Do not report success when execution or persistence fails.
    try {
      await finalizeRun(id, {
        status: "failed",
        metrics: {},
        errorMessage: message,
      });
    } catch (persistErr) {
      console.error(
        `[Critical Persistence Error] Run ${id}:`,
        persistErr?.message ?? String(persistErr),
      );
    }

    try {
      await setAgentStatus(
        agentId,
        TASK_STATUS.ERROR,
      );
    } catch (statusErr) {
      console.error(
        `[Agent Status Error]`,
        statusErr?.message ?? String(statusErr),
      );
    }
  } finally {
    currentRunId = null;
  }
}

/**
 * Startup health checks.
 */
async function initialize() {
  printBanner(config);

  // Database is required.
  await query("SELECT 1");

  check(
    "MySQL connection",
    "reachable",
    true,
  );

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

  if (!modelOk) {
    console.warn(
      "[Warning] Ollama model is unavailable. " +
      "Runs may fail until the model service is available.",
    );
  }

  printReady(config);
}

/**
 * Main worker polling loop.
 *
 * A signal stops new work but allows the current run
 * to finish before the process exits.
 */
async function main() {
  await initialize();

  console.log("[Worker] Polling started.");

  while (running) {
    try {
      const id = await claimNextRun();

      if (id == null) {
        await sleep(config.worker.pollMs);
        continue;
      }

      console.log(
        `[Worker] Claimed run #${id}.`,
      );

      await processRun(id);

    } catch (err) {
      console.error(
        "[Worker Loop Error]",
        err?.message ?? String(err),
      );

      await sleep(config.worker.pollMs);
    }
  }

  console.log(
    `[Worker] Shutdown complete. Signal: ${shutdownSignal ?? "unknown"}`,
  );
}

/**
 * Graceful shutdown.
 */
function shutdown(signal) {
  if (!running) return;

  shutdownSignal = signal;
  running = false;

  console.log(
    `\n[Worker] ${signal} received.`,
  );

  if (currentRunId != null) {
    console.log(
      `[Worker] Finishing current run #${currentRunId} before exit.`,
    );
  } else {
    console.log(
      "[Worker] No active run. Exiting after current loop.",
    );
  }
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

main().catch((err) => {
  console.error(
    "[Worker Fatal Error]",
    err?.stack ?? err?.message ?? String(err),
  );

  process.exitCode = 1;
});
