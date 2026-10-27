import type { JsonObject } from "./types";

export const MAX_JSON_BYTES = 16 * 1024;

export const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

export const posInt = (v: FormDataEntryValue | null) => {
  const s = text(v);
  if (!/^\d{1,9}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
};

export const jsonBytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/** Empty input -> { value: undefined }; otherwise a JSON object within the size limit. */
export const parseJsonObject = (raw: string): { value?: JsonObject; error?: string } => {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Config is not valid JSON." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { error: "Config must be a JSON object." };
  }
  if (jsonBytes(parsed) > MAX_JSON_BYTES) return { error: "Config exceeds the 16KB limit." };
  return { value: parsed as JsonObject };
};
