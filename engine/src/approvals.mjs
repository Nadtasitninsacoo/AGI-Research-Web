/**
 * Command approval gating for the engine.
 *
 * Intrusive/forbidden-tier commands are recorded in `command_approvals` as
 * 'pending' and WAIT for the operator's decision (made from the dashboard
 * Approvals queue), unless the operator has turned on the live auto-approve
 * switch (settings.auto_approve_intrusive). Nothing is auto-approved by default,
 * and a timeout counts as NOT approved (fail-closed).
 */

import { query, execute } from "./db.mjs";
import { notifyApprovalNeeded } from "./notify.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Operator's live auto-approve switch (settings.auto_approve_intrusive). */
async function autoApproveEnabled() {
  try {
    const rows = await query(
      `SELECT value FROM settings WHERE name = 'auto_approve_intrusive' LIMIT 1`,
    );
    return /^(1|true|yes)$/i.test(String(rows[0]?.value ?? ""));
  } catch {
    return false;
  }
}

/** Record a pending approval request; returns its id (or null on failure). */
async function createRequest({ runId, agentId, command, reason, tier }) {
  const res = await execute(
    `INSERT INTO command_approvals (run_id, agent_id, command, reason, tier, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
    [runId ?? null, agentId ?? null, command, reason ?? null, tier ?? "intrusive"],
  );
  return res?.insertId ?? null;
}

/** Resolve a still-pending request to a terminal status. */
async function resolveStatus(id, status) {
  if (id == null) return;
  try {
    await execute(
      `UPDATE command_approvals SET status = ?, resolved_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [status, id],
    );
  } catch {
    /* best-effort */
  }
}

/** Mark a pending request as timed out. */
async function expire(id) {
  await resolveStatus(id, "timeout");
}

/**
 * Record an intrusive command and wait for a decision.
 * Resolves to { decision: "approved" | "denied" | "timeout" }.
 * - auto-approve switch on  → approved immediately.
 * - otherwise               → poll for the operator's decision up to timeoutMs;
 *                             no decision in time → timeout (NOT approved).
 */
async function requestAndWait({
  runId,
  agentId,
  command,
  reason,
  tier,
  timeoutMs,
  pollMs,
}) {
  let id;
  try {
    id = await createRequest({ runId, agentId, command, reason, tier });
  } catch {
    // Can't record the request → fail closed, do NOT approve.
    return { decision: "denied", reason: "approval request could not be recorded" };
  }

  if (await autoApproveEnabled()) {
    await resolveStatus(id, "approved");
    return { decision: "approved", id, auto: true };
  }

  // Ask the operator and wait for their decision.
  Promise.resolve(notifyApprovalNeeded({ command, reason, tier })).catch(() => {});

  const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
  const interval = Math.max(250, Number(pollMs) || 500);

  while (Date.now() < deadline) {
    await sleep(interval);
    try {
      const rows = await query(
        `SELECT status FROM command_approvals WHERE id = ? LIMIT 1`,
        [id],
      );
      const st = String(rows[0]?.status ?? "pending");
      if (st === "approved") return { decision: "approved", id };
      if (st === "denied") return { decision: "denied", id };
    } catch {
      /* keep polling */
    }
  }

  await expire(id);
  return { decision: "timeout", id };
}

export { createRequest, expire, requestAndWait };
