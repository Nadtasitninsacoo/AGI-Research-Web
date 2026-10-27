import "server-only";
import { apiGet } from "./api";
import type { ApiResult, Evaluation, Paginated, Run, RunDetail, RunLog, RunSnapshot } from "./types";

/** Run + its latest logs and evaluations, for the page and its polling route. */
export async function getRunSnapshot(id: number): Promise<ApiResult<RunSnapshot>> {
  const [run, logs, evals] = await Promise.all([
    apiGet<RunDetail>(`/api/runs/${id}`),
    apiGet<Paginated<RunLog>>(`/api/runs/${id}/logs`, { limit: 100 }),
    apiGet<Paginated<Evaluation>>(`/api/runs/${id}/evaluations`, { limit: 100 }),
  ]);
  if (!run.ok) return run;
  return {
    ok: true,
    data: {
      run: run.data,
      logs: logs.ok ? logs.data.data : [],
      logsTotal: logs.ok ? logs.data.pagination.total : 0,
      evaluations: evals.ok ? evals.data.data : [],
    },
  };
}

/** GET /api/runs/:id has no params/names; find them in the experiment's run list. */
export async function findRunRow(id: number, experimentId: number): Promise<Run | null> {
  for (let offset = 0; offset < 1000; offset += 100) {
    const res = await apiGet<Paginated<Run>>("/api/runs", { experimentId, limit: 100, offset });
    if (!res.ok) return null;
    const hit = res.data.data.find((r) => r.id === id);
    if (hit) return hit;
    if (offset + 100 >= res.data.pagination.total) return null;
  }
  return null;
}
