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

/**
 * GET /api/runs/:id has no params/names; find them in the experiment's run list.
 * This is cosmetic (names + prompt) and must not stall the page: the caller
 * streams it. We fetch the first page, then any remaining pages in PARALLEL, so
 * latency is ~2 round-trips regardless of how many runs the experiment has
 * (instead of up to 10 sequential ones).
 */
export async function findRunRow(id: number, experimentId: number): Promise<Run | null> {
  const first = await apiGet<Paginated<Run>>("/api/runs", { experimentId, limit: 100, offset: 0 });
  if (!first.ok) return null;
  const hit = first.data.data.find((r) => r.id === id);
  if (hit) return hit;

  const total = first.data.pagination.total;
  const offsets: number[] = [];
  for (let offset = 100; offset < total && offset < 1000; offset += 100) offsets.push(offset);
  if (!offsets.length) return null;

  const pages = await Promise.all(
    offsets.map((offset) => apiGet<Paginated<Run>>("/api/runs", { experimentId, limit: 100, offset })),
  );
  for (const page of pages) {
    if (!page.ok) continue;
    const found = page.data.data.find((r) => r.id === id);
    if (found) return found;
  }
  return null;
}
