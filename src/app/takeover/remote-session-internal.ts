import { cookies } from "next/headers";
import type {
  AgentStatus,
  RemoteStatus,
  TakeoverAgent,
  RemoteActionResult,
} from "./types";
import { resolveAgentApiBaseUrl } from "@/lib/agentApi";

import {
  AGENT_TOKEN_COOKIE,
  SESSION_COOKIE,
  SESSION_DEVICE_COOKIE,
  SESSION_STATUS_COOKIE,
  VIEWER_TOKEN_COOKIE,
  clearProductionSessionCookies,
} from "@/lib/remoteSessionDemo";

export const API_URL = resolveAgentApiBaseUrl(process.env.AGI_API_URL);
export const SESSION_TTL_SECONDS = 30 * 60;

const REMOTE_STATUSES: readonly RemoteStatus[] = [
  "WAITING",
  "CONNECTED",
  "DISCONNECTED",
  "EXPIRED",
];

export function isRemoteStatus(value: unknown): value is RemoteStatus {
  return (
    typeof value === "string" && REMOTE_STATUSES.includes(value as RemoteStatus)
  );
}

export class RemoteApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RemoteApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseAgent(value: unknown): TakeoverAgent | null {
  if (!isRecord(value)) return null;

  const id = toNumber(value.id, -1);
  const name = typeof value.name === "string" ? value.name : "";

  const allowedStatuses: AgentStatus[] = [
    "idle",
    "running",
    "paused",
    "error",
    "retired",
  ];

  const rawStatus = typeof value.status === "string" ? value.status : "idle";

  if (id < 0 || !name || !allowedStatuses.includes(rawStatus as AgentStatus)) {
    return null;
  }

  return {
    id,
    name,
    description: typeof value.description === "string" ? value.description : "",
    model: typeof value.model === "string" ? value.model : "Unknown",
    status: rawStatus as AgentStatus,
    runs: toNumber(value.runs),
    succeeded: toNumber(value.succeeded),
    failed: toNumber(value.failed),
    avgScore: value.avgScore == null ? null : toNumber(value.avgScore),
  };
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;

  if (typeof payload.message === "string") {
    return payload.message;
  }

  if (
    Array.isArray(payload.message) &&
    payload.message.every((item) => typeof item === "string")
  ) {
    return payload.message.join(", ");
  }

  return fallback;
}

export async function remoteApiRequest(
  path: string,
  method: "GET" | "POST" | "PATCH",
  headers: Record<string, string> = {},
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let response: Response;

  try {
    response = await fetch(new URL(path, API_URL), {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === "TimeoutError"
        ? "Remote API did not respond within 10 seconds."
        : "Remote API is unreachable. Check the backend service.",
    );
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new RemoteApiError(
      getErrorMessage(
        payload,
        `Remote API request failed: HTTP ${response.status}`,
      ),
      response.status,
    );
  }

  if (!isRecord(payload)) {
    throw new Error("Remote API returned an invalid response.");
  }

  return payload;
}

export function readString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function readDeviceName(
  payload: Record<string, unknown>,
): string | null {
  const direct = readString(payload, "deviceName");
  if (direct) return direct;

  if (isRecord(payload.target)) {
    const targetName = readString(payload.target, "deviceName");
    if (targetName) return targetName;
  }

  if (isRecord(payload.connectedDevice)) {
    return readString(payload.connectedDevice, "deviceName");
  }

  return null;
}

export async function getViewerCredentials(sessionId: string) {
  const cookieStore = await cookies();

  const storedSessionId = cookieStore.get(SESSION_COOKIE)?.value;
  const viewerToken = cookieStore.get(VIEWER_TOKEN_COOKIE)?.value;

  if (!storedSessionId || storedSessionId !== sessionId) {
    throw new RemoteApiError("Remote session not found in this browser.", 404);
  }

  if (!viewerToken) {
    throw new RemoteApiError("Remote Viewer Token is missing.", 401);
  }

  return { viewerToken };
}

function clearRemoteCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): void {
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(AGENT_TOKEN_COOKIE);
  cookieStore.delete(VIEWER_TOKEN_COOKIE);
  cookieStore.delete(SESSION_STATUS_COOKIE);
  cookieStore.delete(SESSION_DEVICE_COOKIE);
  clearProductionSessionCookies(cookieStore);
}

export async function toFailure(
  error: unknown,
  fallback: string,
): Promise<Extract<RemoteActionResult, { ok: false }>> {
  if (
    error instanceof RemoteApiError &&
    (error.status === 401 || error.status === 404)
  ) {
    clearRemoteCookies(await cookies());

    return {
      ok: false,
      message: error.message,
      expired: error.status === 404,
    };
  }

  return {
    ok: false,
    message: error instanceof Error ? error.message : fallback,
  };
}

export const ALLOWED_ACTIONS = ["HEALTH_CHECK"] as const;
export const ALLOWED_TARGETS = new Set(
  (process.env.REMOTE_ALLOWED_TARGETS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}