const API_BASE = "/api/research/team-task-plans";

export type TeamTaskTarget = {
  id: number;
  targetType: "ip" | "port";
  ip: string;
  port: number | null;
  service: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  isAuthorized: boolean;
  authorizationStatus: string | null;
};

export type TeamTaskPlanAgent = {
  id: number;
  name: string;
  role: string;
};

export type TeamTaskPlan = {
  id: number;
  name: string;
  description: string | null;
  status: "draft" | "queued" | "cancelled";
  createdAt: string;
  updatedAt: string;
  targets: TeamTaskTarget[];
  agents: TeamTaskPlanAgent[];
};

export type CreateTeamTaskTargetInput = {
  targetType: "ip" | "port";
  ip: string;
  port?: number;
  service?: string;
};

export type CreateTeamTaskPlanInput = {
  name: string;
  description?: string;
  agentIds: number[];
  targets: CreateTeamTaskTargetInput[];
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

export async function fetchTeamTaskPlans(
  signal?: AbortSignal,
): Promise<TeamTaskPlan[]> {
  const response = await fetch(API_BASE, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  const result = await readResponse<
    TeamTaskPlan[] | ApiEnvelope<TeamTaskPlan[]>
  >(response);

  const plans = unwrapData(result);

  if (!Array.isArray(plans)) {
    throw new Error("Invalid team task plans response.");
  }

  return plans;
}

export async function createTeamTaskPlan(
  input: CreateTeamTaskPlanInput,
): Promise<{ id: number; name: string; status: "draft" }> {
  if (!input.name.trim()) {
    throw new Error("Plan name is required.");
  }

  if (input.agentIds.length === 0) {
    throw new Error("Select at least one agent.");
  }

  if (input.targets.length === 0) {
    throw new Error("Add at least one target.");
  }

  for (const target of input.targets) {
    if (!target.ip.trim()) {
      throw new Error("Target IP is required.");
    }

    if (
      target.targetType === "port" &&
      (!Number.isInteger(target.port) ||
        target.port === undefined ||
        target.port < 1 ||
        target.port > 65535)
    ) {
      throw new Error("Port must be between 1 and 65535.");
    }

    if (target.targetType === "ip" && target.port !== undefined) {
      throw new Error("IP targets must not contain a port.");
    }
  }

  const response = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });

  const result = await readResponse<
    ApiEnvelope<{ id: number; name: string; status: "draft" }> |
    { id: number; name: string; status: "draft" }
  >(response);

  const created = unwrapData(result);

  if (!Number.isSafeInteger(created.id) || created.id < 1) {
    throw new Error("The API did not return a valid plan ID.");
  }

  return created;
}