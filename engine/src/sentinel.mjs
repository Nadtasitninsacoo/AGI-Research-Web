// Sentinel: defensive monitoring + automated DEFENSIVE response for the engine.
//
// Purpose: protect the operator / engine box against "counter-attack" during an
// authorized engagement. It does NOT attack back (no hack-back). It only:
//   1. records security-relevant events (scope blocks, forbidden attempts, etc.),
//   2. exposes a live LOCKDOWN kill switch (settings.engine_lockdown), and
//   3. auto-engages lockdown when a burst of high-severity events suggests the
//      agent is being manipulated (e.g. prompt-injection via tool output pushing
//      repeated out-of-scope / forbidden commands) or the box is under probe.
//
// Everything here is fail-safe: a monitoring/DB error must never crash a run.
import { query, execute } from "./db.mjs";

const LOCKDOWN_KEY = "engine_lockdown";

const int = (v, d) => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

// Rolling window + trip thresholds for the automated response. Env-overridable.
const WINDOW_SEC = int(process.env.SENTINEL_WINDOW_MS, 600_000) / 1000;
const TRIP = {
  // Repeated forbidden attempts are the strongest hijack signal: the policy keeps
  // refusing, yet the agent keeps trying -> likely driven by injected instructions.
  policy_deny: int(process.env.SENTINEL_TRIP_FORBIDDEN, 3),
  // Many out-of-scope targets in a short window -> the agent is being steered off
  // the engagement, or someone is fuzzing the scope guard.
  scope_block: int(process.env.SENTINEL_TRIP_SCOPE, 6),
};
// If true, a DB read failure for the kill switch is treated as LOCKED (stop).
// Default false: a transient blip should not halt legitimate recon, and the DB
// being down already cripples approvals/logging anyway.
const FAIL_CLOSED = /^(1|true|yes)$/i.test(process.env.SENTINEL_FAIL_CLOSED ?? "");

/** Record a security event. Never throws. */
export async function recordEvent({ kind, severity = "warn", runId = null, agentId = null, command = null, detail = null }) {
  try {
    await execute(
      `INSERT INTO security_events (kind, severity, run_id, agent_id, command, detail)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        String(kind).slice(0, 40),
        ["info", "warn", "high", "critical"].includes(severity) ? severity : "warn",
        runId ?? null,
        agentId ?? null,
        command != null ? String(command).slice(0, 2000) : null,
        detail != null ? String(detail).slice(0, 4000) : null,
      ],
    );
  } catch {
    /* monitoring must never crash a run */
  }
}

/** Is the engine currently in defensive lockdown? */
export async function isLockdown() {
  try {
    const rows = await query(`SELECT value FROM settings WHERE name = ? LIMIT 1`, [LOCKDOWN_KEY]);
    return /^(1|true|yes)$/i.test(String(rows?.[0]?.value ?? ""));
  } catch {
    return FAIL_CLOSED;
  }
}

/** Engage or lift lockdown, and record the change. Never throws. */
export async function setLockdown(on, { reason = null, runId = null, agentId = null } = {}) {
  try {
    await execute(
      `INSERT INTO settings (name, value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [LOCKDOWN_KEY, on ? "1" : "0"],
    );
  } catch {
    /* best effort */
  }
  await recordEvent({
    kind: "lockdown",
    severity: on ? "critical" : "info",
    runId,
    agentId,
    detail: `LOCKDOWN ${on ? "ENGAGED" : "lifted"}${reason ? `: ${reason}` : ""}`,
  });
}

/**
 * Count recent high/critical events and auto-engage lockdown if a trip threshold
 * is crossed. Returns true if it tripped. Never throws.
 */
export async function evaluateAutoResponse({ runId = null, agentId = null } = {}) {
  try {
    if (await isLockdown()) return true; // already locked
    const rows = await query(
      `SELECT kind, COUNT(*) AS n FROM security_events
       WHERE created_at >= (NOW() - INTERVAL ? SECOND)
         AND severity IN ('high','critical')
       GROUP BY kind`,
      [Math.round(WINDOW_SEC)],
    );
    const counts = Object.fromEntries((rows ?? []).map((r) => [r.kind, Number(r.n)]));
    for (const [kind, limit] of Object.entries(TRIP)) {
      if ((counts[kind] ?? 0) >= limit) {
        await setLockdown(true, {
          reason: `auto-trip on ${kind} (${counts[kind]} in ${Math.round(WINDOW_SEC)}s, limit ${limit})`,
          runId,
          agentId,
        });
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}
