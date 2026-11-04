
import { cookies } from "next/headers";
import {
  AGENT_TOKEN_COOKIE,
  SESSION_COOKIE,
  SESSION_DEVICE_COOKIE,
  SESSION_STATUS_COOKIE,
  VIEWER_TOKEN_COOKIE,
  clearProductionSessionCookies,
} from "@/lib/remoteSessionDemo";

import { RemoteApiError } from "./remote-api";
import type {
  RemoteActionResult,
  RemoteSessionStatus,
} from "./remote-session.types";

const REMOTE_STATUSES: readonly RemoteSessionStatus[] = [
  "WAITING",
  "CONNECTED",
  "DISCONNECTED",
  "EXPIRED",
];

export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isRemoteStatus(
  value: unknown,
): value is RemoteSessionStatus {
  return (
    typeof value === "string" &&
    REMOTE_STATUSES.includes(value as RemoteSessionStatus)
  );
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

export function clearRemoteCookies(
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
