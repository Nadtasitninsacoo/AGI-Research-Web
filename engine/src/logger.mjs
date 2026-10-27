// Structured logging that mirrors to the console and to the `agent_logs`
// table, so every step shows up live on the dashboard (/runs/[id]).
//
// agent_logs.agent_id is NOT NULL, so DB logging only happens when the run is
// tied to an agent. Runs without an agent still log to the console.
import { execute } from "./db.mjs";

const LEVELS = new Set(["debug", "info", "warn", "error"]);

/**
 * @param {object} p
 * @param {number|null} p.agentId
 * @param {number|null} p.runId
 * @param {"debug"|"info"|"warn"|"error"} p.level
 * @param {string} p.message
 * @param {object} [p.context]
 */
export async function log({ agentId, runId, level, message, context }) {
  const lvl = LEVELS.has(level) ? level : "info";
  const stamp = new Date().toISOString();
  const tag = runId ? `run#${runId}` : "worker";
  // Console line for the operator watching the terminal.
  console.log(`[${stamp}] ${lvl.toUpperCase().padEnd(5)} ${tag}  ${message}`);

  if (!agentId) return; // cannot satisfy the NOT NULL FK without an agent
  try {
    await execute(
      `INSERT INTO agent_logs (agent_id, run_id, level, message, context)
       VALUES (?, ?, ?, ?, ?)`,
      [agentId, runId ?? null, lvl, message.slice(0, 60_000), context ? JSON.stringify(context) : null],
    );
  } catch (err) {
    // Never let logging crash a run.
    console.error(`[${stamp}] ERROR worker  failed to write agent_log: ${err?.message ?? err}`);
  }
}
