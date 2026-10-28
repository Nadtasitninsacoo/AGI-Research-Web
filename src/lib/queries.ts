import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

// Dashboard data for the Overview and Nexus pages. Reads MySQL directly — the
// same source the engine writes to — so these pages no longer depend on the
// separate NestJS backend (which is decoupled/retired). Shapes are unchanged so
// the pages consuming this need no edits.

export type AgentStat = {
  id: number;
  name: string;
  model: string | null;
  status: "idle" | "running" | "paused" | "error" | "retired";
  description: string | null;
  runs: number;
  succeeded: number;
  failed: number;
  avgScore: number | null;
};

export type RunRow = {
  id: number;
  status: string;
  experiment: string;
  agent: string | null;
  accuracy: number | null;
  createdAt: string;
};

export type LogRow = {
  id: number;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  agent: string;
  createdAt: string;
};

export type BenchmarkRow = { benchmark: string; score: number; n: number };

export type DashboardData = {
  totals: {
    agents: number;
    agentsRunning: number;
    projects: number;
    experiments: number;
    runs: number;
    runsRunning: number;
    runsQueued: number;
    runsSucceeded: number;
    runsFailed: number;
  };
  agents: AgentStat[];
  runs: RunRow[];
  logs: LogRow[];
  benchmarks: BenchmarkRow[];
};

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? ""));

export async function getDashboardData(): Promise<DashboardData> {
  const [totalsRows, agentRows, runRows, logRows, benchRows] = await Promise.all([
    db.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM agents) AS agents,
         (SELECT COUNT(*) FROM agents WHERE status = 'running') AS agentsRunning,
         (SELECT COUNT(*) FROM research_projects) AS projects,
         (SELECT COUNT(*) FROM experiments) AS experiments,
         (SELECT COUNT(*) FROM experiment_runs) AS runs,
         (SELECT COUNT(*) FROM experiment_runs WHERE status = 'running') AS runsRunning,
         (SELECT COUNT(*) FROM experiment_runs WHERE status = 'queued') AS runsQueued,
         (SELECT COUNT(*) FROM experiment_runs WHERE status = 'succeeded') AS runsSucceeded,
         (SELECT COUNT(*) FROM experiment_runs WHERE status = 'failed') AS runsFailed`,
    ),
    db.query<RowDataPacket[]>(
      `SELECT a.id, a.name, a.model, a.status, a.description,
              COUNT(DISTINCT r.id) AS runs,
              COUNT(DISTINCT CASE WHEN r.status = 'succeeded' THEN r.id END) AS succeeded,
              COUNT(DISTINCT CASE WHEN r.status = 'failed' THEN r.id END) AS failed,
              AVG(ev.score) AS avgScore
       FROM agents a
       LEFT JOIN experiments e ON e.agent_id = a.id
       LEFT JOIN experiment_runs r ON r.experiment_id = e.id
       LEFT JOIN evaluations ev ON ev.run_id = r.id
       GROUP BY a.id, a.name, a.model, a.status, a.description
       ORDER BY a.name`,
    ),
    db.query<RowDataPacket[]>(
      `SELECT r.id, r.status, e.name AS experiment, a.name AS agent,
              (SELECT AVG(score) FROM evaluations WHERE run_id = r.id) AS accuracy,
              r.created_at AS createdAt
       FROM experiment_runs r
       JOIN experiments e ON e.id = r.experiment_id
       LEFT JOIN agents a ON a.id = e.agent_id
       ORDER BY r.id DESC LIMIT 12`,
    ),
    db.query<RowDataPacket[]>(
      `SELECT l.id, l.level, l.message, a.name AS agent, l.created_at AS createdAt
       FROM agent_logs l
       JOIN agents a ON a.id = l.agent_id
       ORDER BY l.id DESC LIMIT 60`,
    ),
    db.query<RowDataPacket[]>(
      `SELECT benchmark, AVG(score) AS score, COUNT(*) AS n
       FROM evaluations GROUP BY benchmark ORDER BY score DESC LIMIT 12`,
    ),
  ]);

  const t = totalsRows[0][0] ?? {};
  const totals: DashboardData["totals"] = {
    agents: num(t.agents),
    agentsRunning: num(t.agentsRunning),
    projects: num(t.projects),
    experiments: num(t.experiments),
    runs: num(t.runs),
    runsRunning: num(t.runsRunning),
    runsQueued: num(t.runsQueued),
    runsSucceeded: num(t.runsSucceeded),
    runsFailed: num(t.runsFailed),
  };

  const agents: AgentStat[] = agentRows[0].map((r) => ({
    id: num(r.id),
    name: String(r.name),
    model: r.model != null ? String(r.model) : null,
    status: r.status as AgentStat["status"],
    description: r.description != null ? String(r.description) : null,
    runs: num(r.runs),
    succeeded: num(r.succeeded),
    failed: num(r.failed),
    avgScore: numOrNull(r.avgScore),
  }));

  const runs: RunRow[] = runRows[0].map((r) => ({
    id: num(r.id),
    status: String(r.status),
    experiment: String(r.experiment),
    agent: r.agent != null ? String(r.agent) : null,
    accuracy: numOrNull(r.accuracy),
    createdAt: iso(r.createdAt),
  }));

  const logs: LogRow[] = logRows[0].map((r) => ({
    id: num(r.id),
    level: r.level as LogRow["level"],
    message: String(r.message),
    agent: String(r.agent),
    createdAt: iso(r.createdAt),
  }));

  const benchmarks: BenchmarkRow[] = benchRows[0].map((r) => ({
    benchmark: String(r.benchmark),
    score: num(r.score),
    n: num(r.n),
  }));

  return { totals, agents, runs, logs, benchmarks };
}
