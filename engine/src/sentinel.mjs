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
// Kill-switch read resilience. The lockdown value is read before every command,
// so a single DB blip must not falsely halt the engine — but a DB that is truly
// down (or deliberately knocked over during a counter-attack) must NOT silently
// disable the kill switch. So: retry a few times, then fail CLOSED by default
// (if we cannot confirm it is safe to run, we stop). An operator can opt into
// fail-open (availability over safety) with SENTINEL_FAIL_OPEN=1 — not advised.
const LOCK_READ_RETRIES = int(process.env.SENTINEL_LOCK_RETRIES, 2); // extra tries after the first
const LOCK_RETRY_MS = int(process.env.SENTINEL_LOCK_RETRY_MS, 200);
// Per-attempt timeout: a dead DB blocks on TCP connect for ~10s, which would
// stall the pre-command check. Cap each read so a down DB is detected in ~1s.
const LOCK_READ_TIMEOUT_MS = int(process.env.SENTINEL_LOCK_TIMEOUT_MS, 1000);
const FAIL_OPEN = /^(1|true|yes)$/i.test(process.env.SENTINEL_FAIL_OPEN ?? "");

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("lock-read-timeout")), ms))]);

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

/**
 * Is the engine currently in defensive lockdown?
 * Reads the kill switch with a short retry so a transient DB blip does not
 * falsely halt the engine; if every attempt fails the DB is genuinely
 * unreachable, so we fail CLOSED (return true) unless SENTINEL_FAIL_OPEN is set.
 */
export async function isLockdown() {
  const attempts = Math.max(0, LOCK_READ_RETRIES) + 1;
  for (let i = 0; i < attempts; i++) {
    try {
      const rows = await withTimeout(
        query(`SELECT value FROM settings WHERE name = ? LIMIT 1`, [LOCKDOWN_KEY]),
        LOCK_READ_TIMEOUT_MS,
      );
      return /^(1|true|yes)$/i.test(String(rows?.[0]?.value ?? ""));
    } catch {
      if (i < attempts - 1) await delay(LOCK_RETRY_MS);
    }
  }
  // Every read failed -> DB unreachable. Stop by default; opt out with FAIL_OPEN.
  return !FAIL_OPEN;
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
