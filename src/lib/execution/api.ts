
import {
  listSavedPortTargets as getSavedPortTargets,
  type SavedPortTarget,
  type SavedPortTargetFilter,
} from "@/app/recon/actions";

import type { ExecutionOptions, Id } from "./types";

/**
 * Load Agents and Experiments from the local DB.
 */
export async function fetchExecutionOptions(
  _signal: AbortSignal,
): Promise<ExecutionOptions> {
  // Read agents + experiments from the local DB via a server action, so the
  // page no longer depends on the retired :3001 backend.
  const { listExecutionOptions } = await import("@/app/execute/options-actions");
  return listExecutionOptions();
}

export type CreateRunInput = {
  experimentId: string;
  agentId: string;
  params: Record<string, unknown>;
};

/**
 * Load saved IP:Port records for the Run Queue.
 */
export async function fetchRunQueueTargets(
  filter: SavedPortTargetFilter = {},
  count: number | null = 100,
): Promise<{ targets: SavedPortTarget[]; total: number }> {
  const result = await getSavedPortTargets(filter, count);

  if (!result.ok) {
    throw new Error(result.message);
  }

  return {
    targets: result.targets,
    total: result.total,
  };
}

/**
 * POST /api/research/experiments/:id/runs
 *
 * A successful response must contain a real persisted Run ID.
 */
export async function createRun(
  input: CreateRunInput,
): Promise<Id> {
  const experimentId = input.experimentId.trim();
  const agentId = input.agentId.trim();

  if (!experimentId || !agentId) {
    throw new Error("Experiment and Agent are required.");
  }

  // Create the run as QUEUED in the local DB via a server action, so the real
  // engine worker executes it. (The old POST to /api/research/...:3001 returned
  // a faked instant-completed run that never ran the agent.)
  const { createRunLocal } = await import("@/app/runs/actions");

  const runId = await createRunLocal({
    experimentId,
    agentId,
    params: input.params,
  });

  if (!runId || runId < 1) {
    throw new Error("The run could not be created.");
  }

  return runId;
}
