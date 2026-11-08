// Engine worker entry point: polls experiment_runs for queued work, runs the agent loop, writes status + metrics.
//
// Polls experiment_runs for queued work, claims one run atomically, runs the
// agent loop, and writes status + metrics back. Decoupled from the NestJS
// backend: it only reads/writes MySQL, so the "finished" backend is untouched.
//
// Start:
//   node --env-file=.env.local engine/src/index.mjs
import { config } from "./config.mjs";
import { query, execute, getConnection } from "./db.mjs";
import { log } from "./logger.mjs";
import { parseScope } from "./scope.mjs";
import { runAgent } from "./agentLoop.mjs";
import { runOrchestrator } from "./orchestrator.mjs";
import { checkModel } from "./ollama.mjs";
import { notifyRunFinished } from "./notify.mjs";
import { printBanner, check, printReady } from "./banner.mjs";
import fs from "node:fs";
import path from "node:path";
import { handoffSuccessfulRun } from "./assessmentHandoff.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Write a pidfile so the web app can detect this engine as "running" however it
// was started — standalone (`npm run engine`) or spawned from the Command page.
// isPidAlive in src/lib/engineProcess.ts guards against a stale file.
const PID_PATH = path.join(process.cwd(), "engine-runtime.pid");
try {
  fs.writeFileSync(PID_PATH, String(process.pid));
} catch {
  /* non-fatal: the engine still runs, the web just can't auto-detect it */
}
function clearPidFile() {
  try {
    if (Number(fs.readFileSync(PID_PATH, "utf8").trim()) === process.pid) {
      fs.unlinkSync(PID_PATH);
    }
  } catch {
    /* already gone or unreadable */
  }
}
process.on("exit", clearPidFile);
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
// True when SKIP LOCKED is unsupported (MySQL < 8 / MariaDB older) — after the
// first such error we stop trying it and use the optimistic claim directly.
let skipLockedUnsupported = false;

/**
 * Atomically claim the highest-priority queued run for THIS worker.
 * 
 * Upgraded with:
 * - Tactical Priority: Prioritizes 'final' (exploitation/exfiltration) stages over 'recon'.
 * - Zombie Reclamation: Automatically recovers crashed or stalled running tasks.
 * - High-Concurrency SKIP LOCKED: Zero collision across multi-threaded worker swarms.
 */
async function claimNextRun() {
  let conn;
  try {
    conn = await getConnection();
  } catch (err) {
    console.error(`[CRITICAL] claim: cannot acquire connection: ${err?.message ?? err}`);
    return null;
  }

  try {
    await conn.beginTransaction();

    // 1. Autonomous Self-Healing: Reclaim zombie/stalled runs (> 15 mins in running state) back to queue
    await conn.execute(
      `UPDATE experiment_runs 
       SET status = 'queued', started_at = NULL 
       WHERE status = 'running' AND started_at < (NOW() - INTERVAL 15 MINUTE)`
    );

    if (skipLockedUnsupported) {
      await conn.commit();
      return claimNextRunOptimistic();
    }

    // 2. High-Priority Atomic Claim with SKIP LOCKED
    // Prioritizes 'final' stage operations to accelerate exfiltration pipelines.
    const [rows] = await conn.query(
      `SELECT id FROM experiment_runs
       WHERE status = 'queued'
       ORDER BY 
         CASE WHEN stage = 'final' THEN 0 ELSE 1 END ASC,
         id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    );

    if (!rows.length) {
      await conn.commit();
      return null;
    }

    const id = rows[0].id;
    
    // 3. Lock and launch execution state
    await conn.execute(
      `UPDATE experiment_runs 
       SET status = 'running', started_at = NOW() 
       WHERE id = ? AND status = 'queued'`,
      [id],
    );

    await conn.commit();
    return id;

  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* connection already broken */
    }

    // Fallback if SKIP LOCKED is unsupported by DB engine
    if (err?.code === "ER_PARSE_ERROR" || err?.code === "ER_NOT_SUPPORTED_YET") {
      skipLockedUnsupported = true;
      return claimNextRunOptimistic();
    }

    console.error(`[ERROR] claim execution failed: ${err?.code ?? ""} ${err?.message ?? err}`);
    return null;
  } finally {
    try {
      conn.release();
    } catch {
      /* already released */
    }
  }
}

/**
 * Optimistic fallback claim for legacy DB engines without SKIP LOCKED support.
 */
async function claimNextRunOptimistic() {
  try {
    const rows = await query(
      `SELECT id FROM experiment_runs
       WHERE status = 'queued'
       ORDER BY CASE WHEN stage = 'final' THEN 0 ELSE 1 END ASC, id ASC
       LIMIT 1`,
    );
    if (!rows.length) return null;
    const id = rows[0].id;

    const res = await execute(
      `UPDATE experiment_runs 
       SET status = 'running', started_at = NOW()
       WHERE id = ? AND status = 'queued'`,
      [id],
    );
    return res.affectedRows === 1 ? id : null;
  } catch (err) {
    console.error(`[ERROR] optimistic claim fallback failed: ${err?.message ?? err}`);
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
    return (
      rows[0] ?? {
        id,
        experiment_id: 1,
        experiment_name: "Research run",
        agent_id: 1,
        agent_name: "agent",
        model: config.ollama.model,
        params: { tools_enabled: true, orchestrate: true },
        agent_config: { tools_enabled: true },
      }
    );
  } catch {
    return {
      id,
      experiment_id: 1,
      experiment_name: "Research run",
      agent_id: 1,
      agent_name: "agent",
      model: config.ollama.model,
      params: { tools_enabled: true, orchestrate: true },
      agent_config: { tools_enabled: true },
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
    await execute(`UPDATE agents SET status = ? WHERE id = ?`, [
      status,
      agentId,
    ]);
  } catch {
    /* bypass status update error */
  }
}

const SEV_SCORE = { critical: 9, high: 7, medium: 5, low: 3, info: 1 };

/**
 * Persist the structured findings an agent reported (in its result) into the
 * `evaluations` table, so results reach the DB even when the model didn't call
 * the record_finding tool itself. Skipped if the run already recorded findings
 * via the tool (no duplicates). Never throws.
 */
async function persistFindings(runId, findings) {
  const list = Array.isArray(findings) ? findings : [];
  if (list.length === 0) return;
  try {
    const existing = await query(
      `SELECT COUNT(*) AS n FROM evaluations WHERE run_id = ?`,
      [runId],
    );
    if (Number(existing[0]?.n ?? 0) > 0) return; // tool already recorded them
    for (const f of list) {
      const title = String(f?.finding ?? f?.title ?? "").trim();
      if (!title) continue;
      const sev = String(f?.severity ?? "info").toLowerCase();
      const score = SEV_SCORE[sev] ?? 1;
      const details = JSON.stringify({
        severity: sev,
        target: f?.target ?? null,
        evidence: f?.evidence ?? null,
        remediation: f?.remediation ?? null,
        confirmed: f?.confirmed ?? null,
      });
      await execute(
        `INSERT INTO evaluations (run_id, benchmark, score, details) VALUES (?, ?, ?, ?)`,
        [runId, title.slice(0, 160), score, details],
      );
    }
  } catch (err) {
    console.error(`persistFindings #${runId} failed: ${err?.message ?? err}`);
  }
}

async function processRun(id) {
  const row = await loadRun(id);
  if (!row) {
    await finalizeRun(id, {
      status: "failed",
      errorMessage: "Run row vanished after claim.",
    });
    return;
  }

  let agentId = row.agent_id ?? 1;
  let agentName = row.agent_name ?? `agent-${agentId}`;
  let agentConfig = asObject(row.agent_config);
  const runParams = asObject(row.params);

  // Honor an agent explicitly chosen in the UI (runParams.agentId), overriding
  // the experiment's default agent — so e.g. a single RECON-1 run isn't forced
  // into the experiment's HYDRA team.
  const reqAgentId = Number(runParams.agentId);
  if (Number.isInteger(reqAgentId) && reqAgentId > 0 && reqAgentId !== agentId) {
    try {
      const arows = await query(
        `SELECT id, name, model, config FROM agents WHERE id = ? LIMIT 1`,
        [reqAgentId],
      );
      if (arows[0]) {
        agentId = arows[0].id;
        agentName = arows[0].name;
        agentConfig = asObject(arows[0].config);
        if (arows[0].model) row.model = arows[0].model;
      }
    } catch {
      /* keep the experiment's default agent */
    }
  }

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
    agentId,
    runId: id,
    level: "info",
    message: `Run started on experiment "${row.experiment_name}" with model ${model}. Scope: ${scope.targets.join(", ") || "(none)"}`,
    context: { scopeLabel: scope.label },
  });

  // Orchestrate (HYDRA multi-agent) only when the run asks for it.
  const orchestrate =
    runParams.orchestrate === true || Boolean(runParams.orchestration);

  await setAgentStatus(agentId, "running");
  try {
    const result = orchestrate
      ? await runOrchestrator({
          runId: id,
          agentId,
          agentName,
          model,
          objective,
          scope,
          agentConfig,
          runParams,
        })
      : await runAgent({
          runId: id,
          agentId,
          agentName,
          model,
          objective,
          scope,
          agentConfig,
          runParams,
          toolsEnabled,
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

    // Make sure reported findings reach the DB even if the model skipped the
    // record_finding tool (this was why evaluations stayed empty).
    await persistFindings(id, result?.metrics?.findings ?? result?.findings);

    // Security Assessment Handoff
    // Only successfully completed runs are eligible.
    // Backend remains responsible for authorization and scope validation.

    if (runStatus === "succeeded") {
      try {
        const handoff = await handoffSuccessfulRun({
          runId: id,
          experimentId: row.experiment_id,
          result,
        });

        await log({
          agentId,
          runId: id,
          level: handoff.accepted ? "info" : "warn",
          message: `Security Assessment handoff: ${JSON.stringify(handoff)}`,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        await log({
          agentId,
          runId: id,
          level: "warn",
          message: `Security Assessment handoff failed: ${errorMessage}`,
        });
      }
    }
    
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
        runId: id,
        status: runStatus,
        experiment: row.experiment_name,
        agent: agentName,
      });
    } catch {
      /* notification delivery is best-effort */
    }
  } catch (err) {
    const message = err?.message ?? String(err);
    await log({
      agentId,
      runId: id,
      level: "error",
      message: `Run failed: ${message}`,
    });
    // A thrown run is a real failure — record it with its reason and flag the
    // agent as errored so the fleet shows the problem, not a false success.
    await finalizeRun(id, {
      status: "failed",
      metrics: {},
      errorMessage: message,
    });
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

  // Run N concurrent worker loops in this one process. claimNextRun is atomic
  // (UPDATE ... WHERE status='queued' + affectedRows check), so loops split the
  // queued targets between them and never process the same run twice. The work
  // is I/O-bound (Ollama HTTP + shell commands), so concurrent async loops give
  // real parallelism without multiple processes.
  const count = config.worker.count;
  if (count > 1) console.log(`Running ${count} concurrent worker loops.`);

  async function workerLoop(index) {
    while (running) {
      try {
        const id = await claimNextRun();
        if (id == null) {
          await sleep(config.worker.pollMs);
          continue;
        }
        console.log(`[w${index}] Claimed run #${id}. Executing...`);
        await processRun(id);
      } catch (err) {
        console.error(`[w${index}] Worker loop auto-recovering: ${err?.message ?? err}`);
        await sleep(config.worker.pollMs);
      }
    }
  }

  await Promise.all(Array.from({ length: count }, (_, i) => workerLoop(i)));
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
  console.error(
    `[engine] uncaughtException (kept alive): ${err?.message ?? err}`,
  );
});

main().catch((err) => {
  console.error(`Fatal override: ${err?.message ?? err}`);
  process.exit(0);
});
