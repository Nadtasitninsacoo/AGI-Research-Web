
"use server";

import { cookies } from "next/headers";
import type { RemoteStatus, RemoteActionResult } from "./types";
import { resolveAgentApiBaseUrl } from "@/lib/agentApi";

export type { RemoteActionResult } from "./types";

import {
  AGENT_TOKEN_COOKIE,
  SESSION_COOKIE,
  SESSION_DEVICE_COOKIE,
  SESSION_STATUS_COOKIE,
  VIEWER_TOKEN_COOKIE,
  clearProductionSessionCookies,
} from "@/lib/remoteSessionDemo";

const API_URL = resolveAgentApiBaseUrl(process.env.AGI_API_URL);
const SESSION_TTL_SECONDS = 30 * 60;

const REMOTE_STATUSES: readonly RemoteStatus[] = [
  "WAITING",
  "CONNECTED",
  "DISCONNECTED",
  "EXPIRED",
];

function isRemoteStatus(value: unknown): value is RemoteStatus {
  return (
    typeof value === "string" &&
    REMOTE_STATUSES.includes(value as RemoteStatus)
  );
}

class RemoteApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RemoteApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

async function remoteApiRequest(
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

function readString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readDeviceName(payload: Record<string, unknown>): string | null {
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

async function getViewerCredentials(sessionId: string) {
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

async function toFailure(
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

export async function applyProductionSession(
  _deviceName?: string,
): Promise<RemoteActionResult> {
  return createRemoteSession();
}

export async function getActiveRemoteSessionId(): Promise<string | null> {
  const cookieStore = await cookies();

  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  const viewerToken = cookieStore.get(VIEWER_TOKEN_COOKIE)?.value;

  return sessionId && viewerToken ? sessionId : null;
}

export async function createRemoteSession(): Promise<RemoteActionResult> {
  try {
    const adminToken = process.env.REMOTE_ADMIN_TOKEN?.trim();

    if (!adminToken) {
      throw new Error(
        "REMOTE_ADMIN_TOKEN is missing from the server environment.",
      );
    }

    const payload = await remoteApiRequest(
      "/api/remote/sessions",
      "POST",
      { "x-remote-admin-token": adminToken },
    );

    const sessionId = readString(payload, "sessionId");
    const agentToken = readString(payload, "agentToken");
    const viewerToken = readString(payload, "viewerToken");
    const status = readString(payload, "status");

    if (!sessionId || !agentToken || !viewerToken || !status) {
      throw new Error(
        "Backend did not return all required session credentials.",
      );
    }

    if (!isRemoteStatus(status)) {
      throw new Error("Backend returned an invalid remote session status.");
    }

    const cookieStore = await cookies();

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    };

    cookieStore.delete(AGENT_TOKEN_COOKIE);
    cookieStore.set(SESSION_COOKIE, sessionId, cookieOptions);
    cookieStore.set(VIEWER_TOKEN_COOKIE, viewerToken, cookieOptions);

    return { ok: true, sessionId, status };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to create remote session.",
    };
  }
}

export async function connectRemoteSession(
  sessionId: string,
  _deviceName: string,
  _commandPayload?: Record<string, unknown>,
): Promise<RemoteActionResult> {
  if (!sessionId?.trim()) {
    return { ok: false, message: "Session ID is required." };
  }

  return {
    ok: false,
    message:
      "The registered Agent must connect using its own Agent Token.",
  };
}

export async function getRemoteSessionStatus(
  sessionId: string,
): Promise<RemoteActionResult> {
  try {
    const normalizedSessionId = sessionId?.trim();

    if (!normalizedSessionId) {
      throw new Error("Session ID is required.");
    }

    const { viewerToken } = await getViewerCredentials(normalizedSessionId);

    const payload = await remoteApiRequest(
      `/api/remote/sessions/${encodeURIComponent(normalizedSessionId)}/status`,
      "GET",
      { "x-remote-viewer-token": viewerToken },
    );

    const returnedSessionId = readString(payload, "sessionId");
    const status = readString(payload, "status");
    const deviceName = readDeviceName(payload);

    if (!isRemoteStatus(status)) {
      throw new Error("Backend returned an invalid remote session status.");
    }

    if (returnedSessionId && returnedSessionId !== normalizedSessionId) {
      throw new Error("Backend returned a mismatched session ID.");
    }

    return {
      ok: true,
      sessionId: normalizedSessionId,
      status,
      ...(deviceName ? { deviceName } : {}),
      ...(typeof payload.updatedAt === "number"
        ? { updatedAt: payload.updatedAt }
        : {}),
    };
  } catch (error) {
    return toFailure(error, "Failed to retrieve remote session status.");
  }
}

export async function disconnectRemoteSession(
  sessionId: string,
): Promise<RemoteActionResult> {
  if (!sessionId?.trim()) {
    return { ok: false, message: "Session ID is required." };
  }

  return {
    ok: false,
    message: "The registered Agent must disconnect itself.",
  };
}
