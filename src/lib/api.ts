import "server-only";
import type { ApiResult } from "./types";

const TIMEOUT_MS = 8000;

type Query = Record<string, string | number | undefined>;

export const qs = (query: Query) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

// Backend error bodies are never forwarded: users only see these generic texts.
const genericMessage = (status: number, write: boolean) => {
  if (status === 400) return "The backend rejected the submitted data.";
  if (status === 401) return "This server is not authorized to make changes. Check the server configuration.";
  if (status === 404) return "The requested item was not found.";
  if (status === 409) return "The item is no longer in a state that allows this action.";
  if (status === 502 || status === 504) return "Unable to reach the AGI backend.";
  return write ? "The change could not be completed." : "The data could not be loaded.";
};

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<ApiResult<T>> {
  const write = method !== "GET";
  const base = (process.env.AGI_API_URL?.trim() || "http://localhost:3001").replace(/\/+$/, "");
  const headers: Record<string, string> = { Accept: "application/json" };

  if (write) {
    const token = process.env.AGI_API_TOKEN?.trim();
    if (!token) return { ok: false, status: 401, message: genericMessage(401, true) };
    headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, status: res.status, message: genericMessage(res.status, write) };
    try {
      return { ok: true, data: (await res.json()) as T };
    } catch {
      return { ok: false, status: 502, message: genericMessage(502, write) };
    }
  } catch {
    return { ok: false, status: 502, message: genericMessage(502, write) };
  }
}

export const apiGet = <T>(path: string, query: Query = {}) => request<T>("GET", `${path}${qs(query)}`);
export const apiPost = <T>(path: string, body?: unknown) => request<T>("POST", path, body);
