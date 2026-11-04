import type { Agent, ApiItem, Experiment, Id } from "./types";

export function isRecord(value: unknown): value is ApiItem {
  return typeof value === "object" && value !== null;
}

export function getItems<T>(
  value: unknown,
  mapper: (item: ApiItem) => T | null,
): T[] {
  let source: unknown = value;

  // รองรับ API response ที่ห่อ data หลายชั้น
  for (let depth = 0; depth < 4; depth++) {
    if (Array.isArray(source)) break;

    if (!isRecord(source)) {
      source = [];
      break;
    }

    if (Array.isArray(source.items)) {
      source = source.items;
      break;
    }

    if (Array.isArray(source.data)) {
      source = source.data;
      break;
    }

    if (source.data !== undefined) {
      source = source.data;
      continue;
    }

    source = [];
    break;
  }

  if (!Array.isArray(source)) return [];

  return source
    .filter(isRecord)
    .map(mapper)
    .filter((item): item is T => item !== null);
}

export function mapAgent(item: ApiItem): Agent | null {
  const id = item.id;
  const name = item.name;

  if (
    (typeof id !== "string" && typeof id !== "number") ||
    typeof name !== "string"
  ) {
    return null;
  }

  return {
    id,
    name,
    status: typeof item.status === "string" ? item.status : undefined,
  };
}

export function mapExperiment(item: ApiItem): Experiment | null {
  const id = item.id;
  const name = item.name;

  if (
    (typeof id !== "string" && typeof id !== "number") ||
    typeof name !== "string"
  ) {
    return null;
  }

  return {
    id,
    name,
    description:
      typeof item.description === "string" ? item.description : undefined,
  };
}

export function getRunId(value: unknown): Id | null {
  let current: unknown = value;

  for (let depth = 0; depth < 4; depth++) {
    if (!isRecord(current)) return null;

    if (typeof current.id === "string" || typeof current.id === "number") {
      return current.id;
    }

    current = current.data ?? current.run ?? current.result;
  }

  return null;
}
