import type { Agent } from "./types";

/** สถานะที่หน้าเดิมถือว่าใช้งานไม่ได้ (inactive / disabled) */
export function isAgentUnavailable(agent: Agent | undefined): boolean {
  const status = agent?.status?.toLowerCase();
  return status === "inactive" || status === "disabled";
}

/** คืน object ถ้าเป็น JSON object ที่ถูกต้อง (ไม่ใช่ array/null) มิฉะนั้นคืน null */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isJsonObject(text: string): boolean {
  return parseJsonObject(text) !== null;
}
