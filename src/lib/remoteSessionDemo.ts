import "server-only";

import { randomUUID } from "node:crypto";

export const SESSION_COOKIE = "agi_remote_session";
export const AGENT_TOKEN_COOKIE = "agi_remote_agent_token";
export const VIEWER_TOKEN_COOKIE = "agi_remote_viewer_token";
export const SESSION_STATUS_COOKIE = "agi_remote_status";
export const SESSION_DEVICE_COOKIE = "agi_remote_device_name";

export type RemoteSessionStatus =
  | "WAITING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "EXPIRED";

export type ProductionSessionState = {
  sessionId: string;
  agentToken: string;
  viewerToken: string;
  status: RemoteSessionStatus;
  deviceName: string;
  updatedAt: number;
};

type CookieValue = {
  value?: string;
};

type CookieReader = {
  get?: (name: string) => CookieValue | undefined;
};

type CookieWriter = {
  set?: (
    name: string,
    value: string,
    options?: {
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: "strict";
      path?: string;
      maxAge?: number;
    },
  ) => void;
};

type CookieDeleter = {
  delete?: (name: string) => void;
};

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const DEVICE_NAME_MAX_LENGTH = 100;
const SESSION_MAX_AGE_SECONDS = 60 * 30;

function isValidSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value);
}

function isValidToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

function normalizeDeviceName(value: string): string {
  const normalized = value.trim().slice(0, DEVICE_NAME_MAX_LENGTH);

  return normalized || "AGI-Agent";
}

/**
 * สร้างเฉพาะ Request ID สำหรับติดตามการทำงาน
 * ไม่ใช่ Session ID และไม่ใช่ Authentication Token
 */
export function createSessionRequestId(): string {
  return randomUUID();
}

/**
 * รับ Session ที่สร้างจาก Backend เท่านั้น
 * ไม่สร้าง Token หรือ Session ปลอมจาก Frontend
 */
export function createProductionSession(
  input: unknown,
): ProductionSessionState {
  if (
    typeof input !== "object" ||
    input === null ||
    !("sessionId" in input) ||
    !("agentToken" in input) ||
    !("viewerToken" in input)
  ) {
    throw new Error("Invalid remote session response.");
  }

  const data = input as Record<string, unknown>;

  const sessionId =
    typeof data.sessionId === "string" ? data.sessionId.trim() : "";

  const agentToken =
    typeof data.agentToken === "string" ? data.agentToken.trim() : "";

  const viewerToken =
    typeof data.viewerToken === "string" ? data.viewerToken.trim() : "";

  if (
    !isValidSessionId(sessionId) ||
    !isValidToken(agentToken) ||
    !isValidToken(viewerToken)
  ) {
    throw new Error("Backend returned invalid session credentials.");
  }

  const deviceName =
    typeof data.deviceName === "string"
      ? normalizeDeviceName(data.deviceName)
      : "AGI-Agent";

  return {
    sessionId,
    agentToken,
    viewerToken,
    status: "WAITING",
    deviceName,
    updatedAt: Date.now(),
  };
}

/**
 * อ่านข้อมูล Session จาก HttpOnly Cookies
 * สถานะที่อ่านได้เป็นเพียงข้อมูลประกอบ
 * ต้องตรวจสอบสถานะจริงกับ Backend ก่อนใช้งาน
 */
export function readProductionSessionFromCookies(
  cookieStore: CookieReader,
): ProductionSessionState | null {
  const sessionId = cookieStore.get?.(SESSION_COOKIE)?.value?.trim();
  const agentToken = cookieStore.get?.(AGENT_TOKEN_COOKIE)?.value?.trim();
  const viewerToken = cookieStore.get?.(VIEWER_TOKEN_COOKIE)?.value?.trim();

  if (
    !sessionId ||
    !agentToken ||
    !viewerToken ||
    !isValidSessionId(sessionId) ||
    !isValidToken(agentToken) ||
    !isValidToken(viewerToken)
  ) {
    return null;
  }

  const deviceName = normalizeDeviceName(
    cookieStore.get?.(SESSION_DEVICE_COOKIE)?.value ?? "AGI-Agent",
  );

  return {
    sessionId,
    agentToken,
    viewerToken,
    status: "WAITING",
    deviceName,
    updatedAt: Date.now(),
  };
}

/**
 * จัดเก็บ Session credentials ใน Server-side HttpOnly Cookies
 */
export function setProductionSessionCookies(
  cookieStore: CookieWriter,
  session: ProductionSessionState,
): void {
  if (
    !isValidSessionId(session.sessionId) ||
    !isValidToken(session.agentToken) ||
    !isValidToken(session.viewerToken)
  ) {
    throw new Error("Cannot store invalid remote session credentials.");
  }

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };

  cookieStore.set?.(SESSION_COOKIE, session.sessionId, cookieOptions);
  cookieStore.set?.(AGENT_TOKEN_COOKIE, session.agentToken, cookieOptions);
  cookieStore.set?.(VIEWER_TOKEN_COOKIE, session.viewerToken, cookieOptions);
  cookieStore.set?.(
    SESSION_DEVICE_COOKIE,
    normalizeDeviceName(session.deviceName),
    cookieOptions,
  );

  // ไม่บันทึกสถานะ CONNECTED จาก Frontend Cookie
  cookieStore.set?.(
    SESSION_DEVICE_COOKIE,
    normalizeDeviceName(session.deviceName),
    cookieOptions,
  );
}

/**
 * ลบข้อมูล Session และ Credentials ทั้งหมด
 */
export function clearProductionSessionCookies(
  cookieStore: CookieDeleter,
): void {
  cookieStore.delete?.(SESSION_COOKIE);
  cookieStore.delete?.(AGENT_TOKEN_COOKIE);
  cookieStore.delete?.(VIEWER_TOKEN_COOKIE);
  cookieStore.delete?.(SESSION_STATUS_COOKIE);
  cookieStore.delete?.(SESSION_DEVICE_COOKIE);
}
