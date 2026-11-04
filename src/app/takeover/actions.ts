"use server";

import { cookies } from "next/headers";
import { listSavedPortTargets } from "@/app/recon/actions";
import type { TakeoverAgent, TakeoverData, RemoteActionResult } from "./types";

export type { RemoteActionResult } from "./types";

import {
  AGENT_TOKEN_COOKIE,
  SESSION_COOKIE,
  VIEWER_TOKEN_COOKIE,
} from "@/lib/remoteSessionDemo";

import {
  API_URL,
  SESSION_TTL_SECONDS,
  ALLOWED_ACTIONS,
  ALLOWED_TARGETS,
  isRemoteStatus,
  isValidPort,
  parseAgent,
  readString,
  readDeviceName,
  remoteApiRequest,
  getViewerCredentials,
  toFailure,
} from "./remote-session-internal";

/**
 * Compatibility wrapper for the existing UI.
 * Production sessions must be created by the backend.
 */
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

export async function getTakeoverData(): Promise<TakeoverData> {
  const [portsResult, agentsResult] = await Promise.all([
    listSavedPortTargets({}, 500),
    fetch(new URL("/api/agents", API_URL), {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null),
  ]);

  let agents: TakeoverAgent[] = [];
  let agentMessage: string | undefined;

  if (!agentsResult?.ok) {
    agentMessage = "เชื่อมต่อ Agent API ไม่สำเร็จ";
  } else {
    try {
      const payload: unknown = await agentsResult.json();

      if (Array.isArray(payload)) {
        agents = payload
          .map(parseAgent)
          .filter((agent): agent is TakeoverAgent => agent !== null);
      } else {
        agentMessage = "รูปแบบข้อมูล Agent API ไม่ถูกต้อง";
      }
    } catch {
      agentMessage = "อ่านข้อมูล Agent API ไม่สำเร็จ";
    }
  }

  return {
    ok: portsResult.ok,
    targets: portsResult.ok ? portsResult.targets : [],
    agents,
    targetMessage: portsResult.ok ? undefined : portsResult.message,
    agentMessage,
  };
}

/**
 * Create a real session through the backend.
 * Dashboard uses Viewer Token for status reads.
 * Agent Token is kept HttpOnly and is never used to impersonate an Agent.
 */
export async function createRemoteSession(): Promise<RemoteActionResult> {
  try {
    const adminToken = process.env.REMOTE_ADMIN_TOKEN?.trim();

    if (!adminToken) {
      throw new Error(
        "REMOTE_ADMIN_TOKEN is missing from the server environment.",
      );
    }

    const payload = await remoteApiRequest("/api/remote/sessions", "POST", {
      "x-remote-admin-token": adminToken,
    });

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

    // Clear any legacy Agent Token stored by an older version.
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
 * Dashboard must not connect an Agent using its Agent Token.
 * The registered Agent process performs the actual connection.
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

    const { viewerToken } = await getViewerCredentials(normalizedSessionId);

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

/**
 * Dashboard may clear its local session reference,
 * but it cannot disconnect the registered Agent.
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
 * Submit an allow-listed remote target action to the backend.
 * Target, port, and action are validated against allow-lists before dispatch.
 */
export async function executeTargetAction(
  sessionId: string,
  targetIp: string,
  targetPort: number,
  actionType: string,
): Promise<RemoteActionResult> {
  try {
    const normalizedSessionId = sessionId?.trim();
    const normalizedTarget = targetIp?.trim();
    const normalizedAction = actionType?.trim();

    if (!normalizedSessionId || !normalizedTarget) {
      throw new Error("Session ID และ Target IP จำเป็นต้องระบุ");
    }

    if (!ALLOWED_TARGETS.has(normalizedTarget)) {
      throw new Error("Target นี้ไม่ได้รับอนุญาตในระบบ");
    }

    if (!isValidPort(targetPort)) {
      throw new Error("Target Port ไม่ถูกต้อง");
    }

    if (
      !ALLOWED_ACTIONS.includes(
        normalizedAction as (typeof ALLOWED_ACTIONS)[number],
      )
    ) {
      throw new Error("Action นี้ไม่ได้รับอนุญาต");
    }

    const { viewerToken } = await getViewerCredentials(normalizedSessionId);

    const payload = await remoteApiRequest(
      "/api/offensive/execute",
      "POST",
      {
        "x-remote-viewer-token": viewerToken,
      },
      {
        sessionId: normalizedSessionId,
        targetIp: normalizedTarget,
        targetPort,
        actionType: normalizedAction,
      },
    );

    return {
      ok: true,
      message: "Backend รับคำขอแล้ว แต่ยังไม่ยืนยันผลการทำงานของ Agent",
      data: payload,
    };
  } catch (error) {
    return toFailure(error, "ไม่สามารถส่งคำขอไปยัง Backend ได้");
  }
}