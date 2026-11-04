const API_BASE = "/api/research/agent-task-queue";

export type QueueStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | string;

export type CreateQueueInput = {
  planId: number;
  targetIds: number[];
  experimentId?: number;
  priority?: number;
  taskName?: string;
  taskDescription?: string;
};

export type QueueCreated = {
  id: number;
  planId: number;
  experimentId: number | null;
  agentId: number;
  totalItems: number;
  status: QueueStatus;
  assessmentType: "AUTHORIZED_METADATA_ONLY";
  networkOperationPerformed: false;
  message?: string;
};

export type QueueAssessment = {
  status: QueueStatus;
  totalItems?: number;
  successfulCount?: number;
  failedCount?: number;
  successfulResults?: unknown[];
  failedResults?: unknown[];
  networkOperationPerformed?: false;
  assessmentType?: "AUTHORIZED_METADATA_ONLY";
  [key: string]: unknown;
};

export type QueueRecord = {
  id: number;
  plan_id?: number;
  planId?: number;
  status: QueueStatus;
  [key: string]: unknown;
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

async function readResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return body as T;
}

function unwrapData<T>(value: T | ApiEnvelope<T>): T {
  if (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    value.data !== undefined
  ) {
    return value.data;
  }

  return value as T;
}

export async function createQueue(
  input: CreateQueueInput,
): Promise<QueueCreated> {
  if (!Number.isSafeInteger(input.planId) || input.planId < 1) {
    throw new Error("Invalid plan ID.");
  }

  if (
    input.targetIds.length === 0 ||
    input.targetIds.length > 100 ||
    input.targetIds.some(
      (id) => !Number.isSafeInteger(id) || id < 1,
    ) ||
    new Set(input.targetIds).size !== input.targetIds.length
  ) {
    throw new Error("Select between 1 and 100 unique valid targets.");
  }

  // Persist to the local DB via a server action; the external backend
  // (/api/research/agent-task-queue → :3001) returns HTTP 500.
  const { createQueueLocal } = await import("@/app/agent-task-queue/actions");
  return createQueueLocal(input);
}

export async function fetchQueues(
  signal?: AbortSignal,
): Promise<QueueRecord[]> {
  const response = await fetch(API_BASE, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  const result = await readResponse<
    QueueRecord[] | ApiEnvelope<QueueRecord[]>
  >(response);

  const queues = unwrapData(result);

  if (!Array.isArray(queues)) {
    throw new Error("Invalid queue list response.");
  }

  return queues;
}

export async function fetchQueue(
  id: number,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("Invalid queue ID.");
  }

  const response = await fetch(`${API_BASE}/${id}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  const result = await readResponse<unknown>(response);
  return unwrapData(result as ApiEnvelope<unknown>);
}

export async function assessQueue(
  id: number,
): Promise<QueueAssessment> {
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("Invalid queue ID.");
  }

  // Read real queue status/counts from the local DB via a server action.
  const { assessQueueLocal } = await import("@/app/agent-task-queue/actions");
  return assessQueueLocal(id);
}