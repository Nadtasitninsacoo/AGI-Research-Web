"use server";

import { revalidatePath } from "next/cache";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/types";
import { posInt } from "@/lib/validate";

/** A run that is genuinely queued or running right now, with its real scope targets. */
export type ActiveRun = {
  id: number;
  status: "queued" | "running";
  targets: string[];
};

function parseConfig(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Pull the agent's authorized scope targets (strings) from its config. */
function extractScopeTargets(config: Record<string, unknown>): string[] {
  const scope = config.scope;
  if (!scope || typeof scope !== "object") return [];
  const targets = (scope as Record<string, unknown>).targets;
  if (!Array.isArray(targets)) return [];
  return targets
    .map((t) => (typeof t === "string" ? t : String(t ?? "")))
    .filter((t) => t.length > 0);
}

/**
 * Create a QUEUED run directly in the local DB so the real engine worker
 * (engine/src/index.mjs) claims and executes it — instead of POSTing to the
 * retired :3001 backend that fakes instant completion. Returns the new run id.
 */
export async function createRunLocal(input: {
  experimentId: string | number;
  agentId?: string | number;
  params?: Record<string, unknown>;
}): Promise<number> {
  const expId = Number(input.experimentId);
  if (!Number.isInteger(expId) || expId < 1) {
    throw new Error("Invalid experiment.");
  }

  const [exp] = await db.query<RowDataPacket[]>(
    `SELECT id FROM experiments WHERE id = ? LIMIT 1`,
    [expId],
  );
  if (!exp[0]) {
    throw new Error(`Experiment #${expId} was not found.`);
  }

  const params =
    input.params && typeof input.params === "object" ? input.params : {};

  const [res] = await db.query<ResultSetHeader>(
    `INSERT INTO experiment_runs (experiment_id, params, status)
     VALUES (?, ?, 'queued')`,
    [expId, JSON.stringify(params)],
  );

  if (!res.insertId) {
    throw new Error("The run could not be created.");
  }

  revalidatePath("/runs");
  return res.insertId;
}

/** Current status for a set of run ids — for badging saved targets the user ran. */
/** Full result of a finished run — output summary + findings recorded to the DB.
 *  Used to carry a recon run's results forward into its final stage. */
export type RunResult = {
  id: number;
  status: string;
  output: string | null;
  findings: { title: string; score: number; details: unknown }[];
};

export async function getRunResult(runId: number): Promise<RunResult | null> {
  const id = Number(runId);
  if (!Number.isInteger(id) || id < 1) return null;

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, status, metrics FROM experiment_runs WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows[0]) return null;

  let metrics: Record<string, unknown> = {};
  const m = rows[0].metrics;
  if (m && typeof m === "object") metrics = m as Record<string, unknown>;
  else if (typeof m === "string") {
    try {
      const parsed = JSON.parse(m);
      if (parsed && typeof parsed === "object") metrics = parsed;
    } catch {
      /* leave empty */
    }
  }

  const [evs] = await db.query<RowDataPacket[]>(
    `SELECT benchmark, score, details FROM evaluations WHERE run_id = ? ORDER BY id`,
    [id],
  );

  return {
    id: rows[0].id as number,
    status: rows[0].status as string,
    output: typeof metrics.output === "string" ? metrics.output : null,
    findings: evs.map((e) => {
      let details: unknown = e.details;
      if (typeof e.details === "string") {
        try {
          details = JSON.parse(e.details);
        } catch {
          /* keep raw string */
        }
      }
      return { title: String(e.benchmark ?? ""), score: Number(e.score ?? 0), details };
    }),
  };
}

export type RunStatusInfo = { id: number; status: string };

export async function getRunStatuses(
  ids: number[],
): Promise<RunStatusInfo[]> {
  const safe = Array.isArray(ids)
    ? [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500)
    : [];

  if (safe.length === 0) return [];

  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, status FROM experiment_runs WHERE id IN (?)`,
      [safe],
    );
    return rows.map((r) => ({ id: Number(r.id), status: String(r.status) }));
  } catch {
    return [];
  }
}

/** A genuinely-active run with display details, for the live monitor list. */
export type ActiveRunInfo = {
  id: number;
  status: "queued" | "running";
  experimentName: string | null;
  agentName: string | null;
  createdAt: string | null;
  startedAt: string | null;
};

const isoOrNull = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : String(v);

/**
 * List runs that are ACTUALLY active (queued/running) right now, with experiment
 * and agent names, for the live run monitor. Returns [] when nothing is active.
 */
export async function listActiveRuns(): Promise<ActiveRunInfo[]> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT r.id, r.status, e.name AS experimentName, a.name AS agentName,
              r.created_at AS createdAt, r.started_at AS startedAt
         FROM experiment_runs r
         JOIN experiments e ON e.id = r.experiment_id
         LEFT JOIN agents a ON a.id = e.agent_id
        WHERE r.status IN ('queued', 'running')
        ORDER BY FIELD(r.status, 'running', 'queued'), r.id DESC
        LIMIT 50`,
    );

    return rows.map((r) => ({
      id: Number(r.id),
      status: String(r.status) as "queued" | "running",
      experimentName: r.experimentName != null ? String(r.experimentName) : null,
      agentName: r.agentName != null ? String(r.agentName) : null,
      createdAt: isoOrNull(r.createdAt),
      startedAt: isoOrNull(r.startedAt),
    }));
  } catch {
    return [];
  }
}

/**
 * List runs that are ACTUALLY active (queued/running) right now, each with the
 * real scope targets of its coordinating agent. Used to badge saved IP/Port rows
 * that a live run is working on. Returns [] when nothing is active — never fakes.
 */
export async function listActiveRunTargets(): Promise<ActiveRun[]> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT r.id, r.status, a.config AS cfg
         FROM experiment_runs r
         JOIN experiments e ON e.id = r.experiment_id
         LEFT JOIN agents a ON a.id = e.agent_id
        WHERE r.status IN ('queued', 'running')
        ORDER BY FIELD(r.status, 'running', 'queued'), r.id DESC
        LIMIT 200`,
    );

    return rows.map((r) => ({
      id: Number(r.id),
      status: String(r.status) as "queued" | "running",
      targets: extractScopeTargets(parseConfig(r.cfg)),
    }));
  } catch {
    return [];
  }
}

// Cancel a run directly in the database. The old NestJS backend (apiPost →
// AGI_API_URL) was retired; the web app now owns run state via `db`, matching
// how listRuns / deleteRuns work.
export async function cancelRunAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = posInt(formData.get("runId"));
  if (id === null) return { ok: false, message: "Run is invalid." };
  return cancelRun(id);
}

/**
 * Cancel a queued/running run directly (callable from the client). Marks it
 * cancelled only if it is still queued or running; the engine worker checks the
 * row status and stops claiming/continuing cancelled runs.
 */
export async function cancelRun(
  runId: number,
): Promise<{ ok: boolean; message: string; id?: number }> {
  const id = Number(runId);
  if (!Number.isInteger(id) || id < 1) {
    return { ok: false, message: "Run is invalid." };
  }

  try {
    const [res] = await db.query<ResultSetHeader>(
      `UPDATE experiment_runs
         SET status = 'cancelled', finished_at = NOW()
       WHERE id = ? AND status IN ('queued', 'running')`,
      [id],
    );

    if (res.affectedRows === 0) {
      return { ok: false, message: `Run #${id} is not queued or running — cannot cancel.` };
    }

    revalidatePath("/runs");
    revalidatePath(`/runs/${id}`);
    revalidatePath("/command");
    return { ok: true, message: `Run #${id} cancelled.`, id };
  } catch {
    return { ok: false, message: "Could not cancel the run (database unreachable)." };
  }
}
