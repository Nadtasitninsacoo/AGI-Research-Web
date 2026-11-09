// Thin, server-only proxy helper for the DARK AGI Windows Execution API — a
// separate platform (own process, port 7411, own auth/scope/approval/audit).
// The API key lives only here (never sent to the browser); routes under
// src/app/api/dark-agi/* are the only callers.

const BASE_URL = (process.env.DARK_AGI_URL?.trim() || "http://127.0.0.1:7411/api/v1").replace(
  /\/+$/,
  "",
);

function apiKey(): string {
  return process.env.DARK_AGI_API_KEY?.trim() || "";
}

export function darkAgiConfigured(): boolean {
  return apiKey().length > 0;
}

export const DARK_AGI_NOT_CONFIGURED =
  "DARK AGI ยังไม่ได้ตั้งค่า — ใส่ DARK_AGI_API_KEY ใน .env.local ก่อน";

/** Call one DARK AGI REST endpoint. Throws only on a network-level failure —
 * a non-2xx HTTP response is returned as-is so callers can relay DARK AGI's
 * own error body (e.g. a BadRequestException message) unchanged. */
export async function darkAgiFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = apiKey();
  if (!key) throw new Error(DARK_AGI_NOT_CONFIGURED);

  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
}
