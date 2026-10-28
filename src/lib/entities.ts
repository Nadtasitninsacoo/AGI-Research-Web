import "server-only";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import type {
  Agent,
  ApiResult,
  Experiment,
  JsonObject,
  Paginated,
  Project,
  Run,
  RunMetrics,
  RunStatus,
} from "@/lib/types";

// Direct-MySQL read layer for the registry / lab / execution pages. Replaces the
// calls that used to go to the retired NestJS backend (apiGet → AGI_API_URL).
// Each function returns ApiResult so the pages' { ok, data, message } handling is
// unchanged.

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
const str = (v: unknown): string => String(v ?? "");
const strOrNull = (v: unknown): string | null => (v == null ? null : String(v));
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

// LIMIT/OFFSET are inlined as sanitized integers (mysql2 is finicky with
// placeholders there); all other values stay parameterized.
const lim = (v: number, max = 500) => Math.min(Math.max(1, Math.floor(v) || 1), max);
const off = (v: number) => Math.max(0, Math.floor(v) || 0);

const fail = <T>(message: string): ApiResult<T> => ({ ok: false, status: 500, message });

const AGENT_STATS = `
  COUNT(DISTINCT r.id) AS runs,
  COUNT(DISTINCT CASE WHEN r.status = 'succeeded' THEN r.id END) AS succeeded,
  COUNT(DISTINCT CASE WHEN r.status = 'failed' THEN r.id END) AS failed,
  AVG(ev.score) AS avgScore`;

function toAgent(r: RowDataPacket): Agent {
  return {
    id: num(r.id),
    name: str(r.name),
    description: strOrNull(r.description),
    model: strOrNull(r.model),
    config: asJson(r.config),
    status: str(r.status) as Agent["status"],
    runs: num(r.runs),
    succeeded: num(r.succeeded),
    failed: num(r.failed),
    avgScore: numOrNull(r.avgScore),
    createdAt: iso(r.createdAt),
  };
}

export async function listAgents(): Promise<ApiResult<Agent[]>> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT a.id, a.name, a.description, a.model, a.config, a.status, a.created_at AS createdAt, ${AGENT_STATS}
       FROM agents a
       LEFT JOIN experiments e ON e.agent_id = a.id
       LEFT JOIN experiment_runs r ON r.experiment_id = e.id
       LEFT JOIN evaluations ev ON ev.run_id = r.id
       GROUP BY a.id, a.name, a.description, a.model, a.config, a.status, a.created_at
       ORDER BY a.name`,
    );
    return { ok: true, data: rows.map(toAgent) };
  } catch {
    return fail("ไม่สามารถโหลดข้อมูลเอเจนต์จากฐานข้อมูล");
  }
}

export async function listProjects(limit = 100): Promise<ApiResult<Paginated<Project>>> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, title, summary, status, owner_id AS ownerId, created_at AS createdAt, updated_at AS updatedAt
       FROM research_projects ORDER BY id DESC LIMIT ${lim(limit)}`,
    );
    const [c] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM research_projects`);
    const data: Project[] = rows.map((r) => ({
      id: num(r.id),
      title: str(r.title),
      summary: strOrNull(r.summary),
      status: str(r.status),
      ownerId: numOrNull(r.ownerId),
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    }));
    return { ok: true, data: { data, pagination: { limit: lim(limit), offset: 0, total: num(c[0]?.total) } } };
  } catch {
    return fail("ไม่สามารถโหลดโปรเจคจากฐานข้อมูล");
  }
}

export async function listExperiments(limit: number, offset: number): Promise<ApiResult<Paginated<Experiment>>> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT e.id, e.project_id AS projectId, e.agent_id AS agentId, e.dataset_id AS datasetId,
              e.name, e.hypothesis, e.status, a.name AS agentName,
              COUNT(r.id) AS runCount, e.created_at AS createdAt, e.updated_at AS updatedAt
       FROM experiments e
       LEFT JOIN agents a ON a.id = e.agent_id
       LEFT JOIN experiment_runs r ON r.experiment_id = e.id
       GROUP BY e.id, e.project_id, e.agent_id, e.dataset_id, e.name, e.hypothesis, e.status, a.name, e.created_at, e.updated_at
       ORDER BY e.id DESC LIMIT ${lim(limit)} OFFSET ${off(offset)}`,
    );
    const [c] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM experiments`);
    const data: Experiment[] = rows.map((r) => ({
      id: num(r.id),
      projectId: num(r.projectId),
      agentId: numOrNull(r.agentId),
      datasetId: numOrNull(r.datasetId),
      name: str(r.name),
      hypothesis: strOrNull(r.hypothesis),
      status: str(r.status),
      agentName: strOrNull(r.agentName),
      runCount: num(r.runCount),
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    }));
    return { ok: true, data: { data, pagination: { limit: lim(limit), offset: off(offset), total: num(c[0]?.total) } } };
  } catch {
    return fail("ไม่สามารถโหลดการทดลองจากฐานข้อมูล");
  }
}

export function toRun(r: RowDataPacket): Run {
  return {
    id: num(r.id),
    experimentId: num(r.experimentId),
    experimentName: strOrNull(r.experimentName),
    agentName: strOrNull(r.agentName),
    status: str(r.status) as RunStatus,
    params: asJson(r.params),
    metrics: asJson(r.metrics) as RunMetrics | null,
    errorMessage: strOrNull(r.errorMessage),
    createdAt: iso(r.createdAt),
    startedAt: isoOrNull(r.startedAt),
    finishedAt: isoOrNull(r.finishedAt),
  };
}

export async function listRuns(opts: {
  limit: number;
  offset: number;
  status?: RunStatus;
  experimentId?: number;
}): Promise<ApiResult<Paginated<Run>>> {
  const cond: string[] = [];
  const args: (string | number)[] = [];
  if (opts.status) {
    cond.push("r.status = ?");
    args.push(opts.status);
  }
  if (opts.experimentId != null) {
    cond.push("r.experiment_id = ?");
    args.push(opts.experimentId);
  }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT r.id, r.experiment_id AS experimentId, e.name AS experimentName, a.name AS agentName,
              r.status, r.params, r.metrics, r.error_message AS errorMessage,
              r.created_at AS createdAt, r.started_at AS startedAt, r.finished_at AS finishedAt
       FROM experiment_runs r
       JOIN experiments e ON e.id = r.experiment_id
       LEFT JOIN agents a ON a.id = e.agent_id
       ${where}
       ORDER BY r.id DESC LIMIT ${lim(opts.limit)} OFFSET ${off(opts.offset)}`,
      args,
    );
    const [c] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM experiment_runs r ${where}`,
      args,
    );
    return {
      ok: true,
      data: {
        data: rows.map(toRun),
        pagination: { limit: lim(opts.limit), offset: off(opts.offset), total: num(c[0]?.total) },
      },
    };
  } catch {
    return fail("ไม่สามารถโหลดรายการ run จากฐานข้อมูล");
  }
}
