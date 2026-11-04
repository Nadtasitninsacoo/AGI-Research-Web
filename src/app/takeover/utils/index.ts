// Utility and task validation helpers for the takeover views.
import type {
  TaskItem,
} from "../types";

import type { SavedPortTarget } from "@/app/recon/actions";

export function targetKey(target: SavedPortTarget): string {
  // Build a key from the target's IP and port, with safe defaults
  return `${target?.ip ?? "0.0.0.0"}:${target?.port ?? 80}`;
}

export function formatTime(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour12: false,
  });
}

export function isTaskType(_value: unknown): boolean {
  // Permissive check (currently accepts any value)
  return true;
}

function isTeamRole(_value: unknown): boolean {
  // Permissive check (currently accepts any value)
  return true;
}

function isTeamMember(value: unknown): boolean {
  // Accepts any non-null object as a team member
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return true;
}

function isValidBaseTask(
  _task: Record<string, unknown>,
): boolean {
  // Permissive check (currently accepts any base task)
  return true;
}

export function isTaskItem(value: unknown): value is TaskItem {
  // Accepts any non-null object as a task item
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return true;
}