import "server-only";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import type { ApiResult, Paginated } from "@/lib/types";

// Direct-MySQL read layer for the cross-run Findings page: aggregates
// `evaluations` (what agents confirmed) joined with the run/experiment/agent
// that produced each one, so an operator can triage everything in one place
// instead of opening each run individually.

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const isSeverity = (v: unknown): v is Severity => SEVERITIES.some((s) => s === v);

export type FindingRow = {
  id: number;
  runId: number;
  experimentId: number;
  experimentName: string | null;
  agentName: string | null;
  runStatus: string;
  benchmark: string;
  score: number;
  severity: Severity;
  target: string | null;
  remediation: string | null;
  createdAt: string;
};

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? ""));
const lim = (v: number, max = 200) => Math.min(Math.max(1, Math.floor(v) || 1), max);
const off = (v: number) => Math.max(0, Math.floor(v) || 0);

function normalizeSeverity(raw: unknown): Severity {
  const v = String(raw ?? "").trim().toLowerCase();
  return isSeverity(v) ? v : "info";
}

const fail = <T>(message: string): ApiResult<T> => ({ ok: false, status: 500, message });

function toFinding(r: RowDataPacket): FindingRow {
  return {
    id: num(r.id),
    runId: num(r.runId),
    experimentId: num(r.experimentId),
    experimentName: r.experimentName != null ? String(r.experimentName) : null,
    agentName: r.agentName != null ? String(r.agentName) : null,
    runStatus: String(r.runStatus ?? ""),
    benchmark: String(r.benchmark ?? ""),
    score: num(r.score),
    severity: normalizeSeverity(r.severity),
    target: r.target != null ? String(r.target) : null,
    remediation: r.remediation != null ? String(r.remediation) : null,
    createdAt: iso(r.createdAt),
  };
}

export async function listFindings(opts: {
  limit: number;
  offset: number;
  severity?: Severity;
  search?: string;
  experimentId?: number;
}): Promise<ApiResult<Paginated<FindingRow>>> {
  const cond: string[] = [];
  const args: (string | number)[] = [];

  if (opts.severity) {
    cond.push(`JSON_UNQUOTE(JSON_EXTRACT(ev.details, '$.severity')) = ?`);
    args.push(opts.severity);
  }
  if (opts.experimentId != null) {
    cond.push("r.experiment_id = ?");
    args.push(opts.experimentId);
  }
  if (opts.search && opts.search.trim()) {
    const needle = `%${opts.search.trim()}%`;
    cond.push(`(ev.benchmark LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(ev.details, '$.target')) LIKE ?)`);
    args.push(needle, needle);
  }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";

  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT ev.id, ev.run_id AS runId, ev.benchmark, ev.score, ev.created_at AS createdAt,
              JSON_UNQUOTE(JSON_EXTRACT(ev.details, '$.severity')) AS severity,
              JSON_UNQUOTE(JSON_EXTRACT(ev.details, '$.target')) AS target,
              JSON_UNQUOTE(JSON_EXTRACT(ev.details, '$.remediation')) AS remediation,
              r.experiment_id AS experimentId, r.status AS runStatus,
              e.name AS experimentName, a.name AS agentName
       FROM evaluations ev
       JOIN experiment_runs r ON r.id = ev.run_id
       JOIN experiments e ON e.id = r.experiment_id
       LEFT JOIN agents a ON a.id = e.agent_id
       ${where}
       ORDER BY ev.id DESC LIMIT ${lim(opts.limit)} OFFSET ${off(opts.offset)}`,
      args,
    );
    const [c] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM evaluations ev JOIN experiment_runs r ON r.id = ev.run_id ${where}`,
      args,
    );
    return {
      ok: true,
      data: {
        data: rows.map(toFinding),
        pagination: { limit: lim(opts.limit), offset: off(opts.offset), total: num(c[0]?.total) },
      },
    };
  } catch {
    return fail("ไม่สามารถโหลดรายการผลลัพธ์จากฐานข้อมูล");
  }
}

export type FindingsSummary = {
  total: number;
  bySeverity: Record<Severity, number>;
  distinctTargets: number;
  runsWithFindings: number;
};

export async function getFindingsSummary(): Promise<ApiResult<FindingsSummary>> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS total,
         COUNT(DISTINCT run_id) AS runsWithFindings,
         COUNT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(details, '$.target'))) AS distinctTargets,
         JSON_UNQUOTE(JSON_EXTRACT(details, '$.severity')) AS severity
       FROM evaluations
       GROUP BY severity`,
    );
    const bySeverity: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    let total = 0;
    let runsWithFindings = 0;
    const targets = new Set<string>();
    for (const r of rows) {
      const sev = normalizeSeverity(r.severity);
      const n = num(r.total);
      bySeverity[sev] += n;
      total += n;
      runsWithFindings = Math.max(runsWithFindings, num(r.runsWithFindings));
    }
    // distinctTargets is grouped per-severity above (not meaningful summed); do a
    // second, ungrouped query for the real cross-severity distinct count.
    const [[dt]] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(details, '$.target'))) AS n FROM evaluations`,
    );
    void targets;
    return {
      ok: true,
      data: { total, bySeverity, distinctTargets: num(dt?.n), runsWithFindings },
    };
  } catch {
    return fail("ไม่สามารถโหลดสรุปผลลัพธ์จากฐานข้อมูล");
  }
}

export type ExperimentOption = { id: number; name: string };

/** Distinct experiments that have at least one finding, for the filter dropdown. */
export async function listExperimentsWithFindings(): Promise<ExperimentOption[]> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT DISTINCT e.id, e.name
       FROM experiments e
       JOIN experiment_runs r ON r.experiment_id = e.id
       JOIN evaluations ev ON ev.run_id = r.id
       ORDER BY e.name`,
    );
    return rows.map((r) => ({ id: num(r.id), name: String(r.name) }));
  } catch {
    return [];
  }
}
