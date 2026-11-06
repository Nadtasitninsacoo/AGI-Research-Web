
"use server";

import { cookies } from "next/headers";
import {
  AGENT_TOKEN_COOKIE,
  SESSION_COOKIE,
  SESSION_DEVICE_COOKIE,
  SESSION_STATUS_COOKIE,
  VIEWER_TOKEN_COOKIE,
  clearProductionSessionCookies,
} from "@/lib/remoteSessionDemo";

import { remoteApiRequest, RemoteApiError } from "./remote-api";
import {
  isRemoteStatus,
  readString,
  readDeviceName,
  clearRemoteCookies,
  getViewerCredentials,
  toFailure,
} from "./remote-session.utils";

import type { RemoteActionResult } from "./remote-session.types";

const SESSION_TTL_SECONDS = 30 * 60;

/**
 * Compatibility wrapper for the existing UI.
 * Production sessions must be created by the backend.
 */
export async function applyProductionSession(
  _deviceName?: string,
): Promise<RemoteActionResult> {
  return createRemoteSession();
}

/**
 * Return the active session ID only when both
 * the session ID and Viewer Token exist.
 */
export async function getActiveRemoteSessionId(): Promise<string | null> {
  const cookieStore = await cookies();

  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  const viewerToken = cookieStore.get(VIEWER_TOKEN_COOKIE)?.value;

  return sessionId && viewerToken ? sessionId : null;
}

/**
 * Create a real session through the backend.
 *
 * Dashboard stores only the Viewer Token.
 * Agent Token is never stored or used to impersonate an Agent.
 */
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
      {
        "x-remote-admin-token": adminToken,
      },
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
      throw new Error(
        "Backend returned an invalid remote session status.",
      );
    }

    const cookieStore = await cookies();

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    };

    // Remove any legacy Agent Token cookie.
    cookieStore.delete(AGENT_TOKEN_COOKIE);

    cookieStore.set(SESSION_COOKIE, sessionId, cookieOptions);
    cookieStore.set(VIEWER_TOKEN_COOKIE, viewerToken, cookieOptions);

    return {
      ok: true,
      sessionId,
      status,
    };
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

/**
 * Dashboard cannot connect an Agent using its Agent Token.
 * The registered Agent process must perform the connection.
 */
export async function connectRemoteSession(
  sessionId: string,
  _deviceName: string,
  _commandPayload?: Record<string, unknown>,
): Promise<RemoteActionResult> {
  if (!sessionId?.trim()) {
    return {
      ok: false,
      message: "Session ID is required.",
    };
  }

  return {
    ok: false,
    message:
      "Dashboard cannot impersonate an Agent. The registered Agent must connect using its own Agent Token.",
  };
}

/**
 * Read authoritative session status using Viewer Token only.
 */
export async function getRemoteSessionStatus(
  sessionId: string,
): Promise<RemoteActionResult> {
  try {
    const normalizedSessionId = sessionId?.trim();

    if (!normalizedSessionId) {
      throw new Error("Session ID is required.");
    }

    const { viewerToken } =
      await getViewerCredentials(normalizedSessionId);

    const payload = await remoteApiRequest(
      `/api/remote/sessions/${encodeURIComponent(normalizedSessionId)}/status`,
      "GET",
      {
        "x-remote-viewer-token": viewerToken,
      },
    );

    const returnedSessionId = readString(payload, "sessionId");
    const status = readString(payload, "status");
    const deviceName = readDeviceName(payload);

    if (!isRemoteStatus(status)) {
      throw new Error(
        "Backend returned an invalid remote session status.",
      );
    }

    if (
      returnedSessionId &&
      returnedSessionId !== normalizedSessionId
    ) {
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
    return toFailure(
      error,
      "Failed to retrieve remote session status.",
    );
  }
}

/**
 * Dashboard cannot disconnect the registered Agent.
 */
export async function disconnectRemoteSession(
  sessionId: string,
): Promise<RemoteActionResult> {
  if (!sessionId?.trim()) {
    return {
      ok: false,
      message: "Session ID is required.",
    };
  }

  return {
    ok: false,
    message:
      "Dashboard cannot disconnect an Agent using its credentials. The Agent must disconnect itself.",
  };
}

/**
 * Remote target execution is intentionally disabled.
 */
export async function executeTargetAction(
  _sessionId: string,
  _targetIp: string,
  _targetPort: number,
  _actionType: string,
): Promise<RemoteActionResult> {
  return {
    ok: false,
    message:
      "Remote target execution is disabled. This endpoint is not available for dashboard actions.",
  };
}
