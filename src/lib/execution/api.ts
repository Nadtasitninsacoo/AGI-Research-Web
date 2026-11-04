
import {
  getItems,
  isRecord,
  mapAgent,
  mapExperiment,
} from "./mappers";

import {
  listSavedPortTargets as getSavedPortTargets,
  type SavedPortTarget,
  type SavedPortTargetFilter,
} from "@/app/recon/actions";

import type { ExecutionOptions, Id } from "./types";

async function readResponse(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function getErrorMessage(
  result: unknown,
  fallback: string,
): string {
  if (isRecord(result)) {
    if (typeof result.message === "string") {
      return result.message;
    }

    if (typeof result.error === "string") {
      return result.error;
    }
  }

  return fallback;
}

/**
 * Load real Agents and Experiments from Research API.
 */
export async function fetchExecutionOptions(
  signal: AbortSignal,
): Promise<ExecutionOptions> {
  const [agentResponse, experimentResponse] = await Promise.all([
    fetch("/api/research/agents", {
      method: "GET",
      cache: "no-store",
      signal,
    }),
    fetch("/api/research/experiments", {
      method: "GET",
      cache: "no-store",
      signal,
    }),
  ]);

  const [agentData, experimentData] = await Promise.all([
    readResponse(agentResponse),
    readResponse(experimentResponse),
  ]);

  if (!agentResponse.ok) {
    throw new Error(
      getErrorMessage(
        agentData,
        `Loading Agents failed (${agentResponse.status}).`,
      ),
    );
  }

  if (!experimentResponse.ok) {
    throw new Error(
      getErrorMessage(
        experimentData,
        `Loading Experiments failed (${experimentResponse.status}).`,
      ),
    );
  }

  return {
    agents: getItems(agentData, mapAgent),
    experiments: getItems(experimentData, mapExperiment),
  };
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
