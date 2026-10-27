// Per-command approval: record an intrusive command as pending, then wait for
// an operator's approve/deny from the web. All DB access is fail-closed — if
// the table is missing or the DB errors, the request resolves as "unavailable"
// and the caller treats it as not approved (the command does not run).
import { query, execute } from "./db.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Insert a pending approval row and return its id, or null on failure. */
async function createRequest({ runId, agentId, command, reason, tier }) {
  try {
    const res = await execute(
      `INSERT INTO command_approvals (run_id, agent_id, command, reason, tier, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [runId ?? null, agentId ?? null, command, reason ?? null, tier ?? "intrusive"],
    );
    return res?.insertId ?? null;
  } catch {
    return null;
  }
}

/** Mark a still-pending request as timed out, so the web queue does not show it forever. */
async function expire(id) {
  try {
    await execute(`UPDATE command_approvals SET status = 'timeout', resolved_at = NOW() WHERE id = ? AND status = 'pending'`, [id]);
  } catch {
    /* best effort */
  }
}

/**
 * Record a pending approval and poll until the operator decides or it times out.
 * @returns {Promise<{ decision: "approved"|"denied"|"timeout"|"unavailable", id: number|null }>}
 */
export async function requestAndWait({ runId, agentId, command, reason, tier, timeoutMs, pollMs }) {
  const id = await createRequest({ runId, agentId, command, reason, tier });
  if (!id) return { decision: "unavailable", id: null };

  const deadline = Date.now() + Math.max(1000, timeoutMs ?? 300_000);
  const step = Math.max(500, pollMs ?? 2_500);
  while (Date.now() < deadline) {
    await sleep(step);
    let status;
    try {
      const rows = await query(`SELECT status FROM command_approvals WHERE id = ? LIMIT 1`, [id]);
      status = rows?.[0]?.status;
    } catch {
      return { decision: "unavailable", id };
    }
    if (status === "approved") return { decision: "approved", id };
    if (status === "denied") return { decision: "denied", id };
    // still pending -> keep waiting
  }
  await expire(id);
  return { decision: "timeout", id };
}
