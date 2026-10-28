import "server-only";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { toRun } from "@/lib/entities";
import type {
  ApiResult,
  Evaluation,
  JsonObject,
  Run,
  RunDetail,
  RunLog,
  RunSnapshot,
  RunStatus,
} from "@/lib/types";

// Direct-MySQL run reads for the run detail page and its /live polling route.
// Replaces the calls that went to the retired NestJS backend.

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? ""));
const isoOrNull = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
const asJson = (v: unknown): JsonObject | null => {
  if (v == null) return null;
  if (typeof v === "object") return v as JsonObject;
  try {
    const o: unknown = JSON.parse(String(v));
    return o && typeof o === "object" ? (o as JsonObject) : null;
  } catch {
    return null;
  }
};

/** Run + its latest logs and evaluations, for the page and its polling route. */
export async function getRunSnapshot(id: number): Promise<ApiResult<RunSnapshot>> {
  try {
    const [runRows] = await db.query<RowDataPacket[]>(
      `SELECT id, experiment_id AS experimentId, status, metrics, error_message AS errorMessage,
              created_at AS createdAt, started_at AS startedAt, finished_at AS finishedAt
       FROM experiment_runs WHERE id = ? LIMIT 1`,
      [id],
    );
    const r = runRows[0];
    if (!r) return { ok: false, status: 404, message: "The requested item was not found." };

    const run: RunDetail = {
      id: num(r.id),
      experimentId: num(r.experimentId),
      status: String(r.status) as RunStatus,
      metrics: asJson(r.metrics),
      errorMessage: r.errorMessage != null ? String(r.errorMessage) : null,
      createdAt: iso(r.createdAt),
      startedAt: isoOrNull(r.startedAt),
      finishedAt: isoOrNull(r.finishedAt),
    };

    const [[logRows], [logCount], [evalRows]] = await Promise.all([
      db.query<RowDataPacket[]>(
        `SELECT id, agent_id AS agentId, run_id AS runId, level, message, context, created_at AS createdAt
         FROM agent_logs WHERE run_id = ? ORDER BY id DESC LIMIT 100`,
        [id],
      ),
      db.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM agent_logs WHERE run_id = ?`, [id]),
      db.query<RowDataPacket[]>(
        `SELECT id, run_id AS runId, benchmark, score, details, created_at AS createdAt
         FROM evaluations WHERE run_id = ? ORDER BY id DESC LIMIT 100`,
        [id],
      ),
    ]);

    // Latest 100 logs, returned oldest-first for a natural feed.
    const logs: RunLog[] = logRows
      .map((l) => ({
        id: num(l.id),
        agentId: num(l.agentId),
        runId: num(l.runId),
        level: String(l.level) as RunLog["level"],
        message: String(l.message),
        context: asJson(l.context),
        createdAt: iso(l.createdAt),
      }))
      .reverse();

    const evaluations: Evaluation[] = evalRows.map((e) => ({
      id: num(e.id),
      runId: num(e.runId),
      benchmark: String(e.benchmark),
      score: num(e.score),
      details: asJson(e.details),
      createdAt: iso(e.createdAt),
    }));

    return { ok: true, data: { run, logs, logsTotal: num(logCount[0]?.total), evaluations } };
  } catch {
    return { ok: false, status: 502, message: "The data could not be loaded." };
  }
}

/** Cosmetic names + prompt for the run header: one direct lookup by run id. */
export async function findRunRow(id: number): Promise<Run | null> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT r.id, r.experiment_id AS experimentId, e.name AS experimentName, a.name AS agentName,
              r.status, r.params, r.metrics, r.error_message AS errorMessage,
              r.created_at AS createdAt, r.started_at AS startedAt, r.finished_at AS finishedAt
       FROM experiment_runs r
       JOIN experiments e ON e.id = r.experiment_id
       LEFT JOIN agents a ON a.id = e.agent_id
       WHERE r.id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? toRun(rows[0]) : null;
  } catch {
    return null;
  }
}
