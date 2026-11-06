
import { resolveAgentApiBaseUrl } from "@/lib/agentApi";

const API_URL = resolveAgentApiBaseUrl(process.env.AGI_API_URL);

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function getErrorMessage(
  payload: unknown,
  fallback: string,
): string {
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
