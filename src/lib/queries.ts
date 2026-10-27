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

// Shape returned by the backend: GET {AGI_API_URL}/api/overview
type OverviewResponse = DashboardData & { status: "ok"; source: string };

const TOTAL_KEYS: (keyof DashboardData["totals"])[] = [
  "agents",
  "agentsRunning",
  "projects",
  "experiments",
  "runs",
  "runsRunning",
  "runsQueued",
  "runsSucceeded",
  "runsFailed",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOverviewResponse(value: unknown): value is OverviewResponse {
  if (!isRecord(value) || value.status !== "ok") return false;

  const { totals } = value;
  if (!isRecord(totals)) return false;
  if (!TOTAL_KEYS.every((key) => typeof totals[key] === "number")) return false;

  return (
    Array.isArray(value.agents) &&
    Array.isArray(value.runs) &&
    Array.isArray(value.logs) &&
    Array.isArray(value.benchmarks)
  );
}

export async function getDashboardData(): Promise<DashboardData> {
  const base = process.env.AGI_API_URL;

  if (!base) {
    throw new Error("AGI_API_URL is not configured");
  }

  const response = await fetch(new URL("/api/overview", base), {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }

  const body: unknown = await response.json();

  if (!isOverviewResponse(body)) {
    throw new Error("Backend returned an unexpected response shape");
  }

  const { totals, agents, runs, logs, benchmarks } = body;

  return { totals, agents, runs, logs, benchmarks };
}
