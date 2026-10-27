export type AgentStatus = "idle" | "running" | "paused" | "error" | "retired";
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type LogLevel = "debug" | "info" | "warn" | "error";

export const RUN_STATUSES: readonly RunStatus[] = ["queued", "running", "succeeded", "failed", "cancelled"];
export const isRunStatus = (v: unknown): v is RunStatus => RUN_STATUSES.some((s) => s === v);
export const isRunFinal = (s: RunStatus) => s === "succeeded" || s === "failed" || s === "cancelled";

export type JsonObject = Record<string, unknown>;

export interface PaginationMeta {
  limit: number;
  offset: number;
  total: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface Agent {
  id: number;
  name: string;
  description: string | null;
  model: string | null;
  config: JsonObject | null;
  status: AgentStatus;
  runs: number;
  succeeded: number;
  failed: number;
  avgScore: number | null;
  createdAt: string;
}

export interface Project {
  id: number;
  title: string;
  summary: string | null;
  status: string;
  ownerId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Experiment {
  id: number;
  projectId: number;
  agentId: number | null;
  datasetId: number | null;
  name: string;
  hypothesis: string | null;
  status: string;
  agentName: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RunMetrics {
  accuracy?: number;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  output?: string;
}

/** Row from GET /api/runs */
export interface Run {
  id: number;
  experimentId: number;
  experimentName: string | null;
  agentName: string | null;
  status: RunStatus;
  params: JsonObject | null;
  metrics: RunMetrics | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** Response of GET /api/runs/:id and POST /api/runs/:id/cancel (no params, no names) */
export interface RunDetail {
  id: number;
  experimentId: number;
  status: RunStatus;
  metrics: RunMetrics | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RunLog {
  id: number;
  agentId: number;
  runId: number;
  level: LogLevel;
  message: string;
  context: JsonObject | null;
  createdAt: string;
}

export interface Evaluation {
  id: number;
  runId: number;
  benchmark: string;
  score: number;
  details: JsonObject | null;
  createdAt: string;
}

/** Live snapshot of one run, shared by the run page and its polling route */
export interface RunSnapshot {
  run: RunDetail;
  logs: RunLog[];
  logsTotal: number;
  evaluations: Evaluation[];
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

export type FormState = { ok: boolean; message: string; id?: number } | null;
