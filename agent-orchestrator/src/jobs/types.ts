import type { Brief } from "./brief-schema.js";

/** `explore` is read-only; `worker` may edit files, confined to the brief's allowedPaths. */
export const JOB_TYPES = ["explore", "worker"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export type JobStatus = "running" | "done" | "error" | "stopped";

export type JobRecord = {
  id: string;
  type: JobType;
  status: JobStatus;
  brief: Brief;
  startedAt: number;
  endedAt?: number;
  costUsd: number;
  /** Final report (success) or error text. Undefined while running. */
  report?: string;
};

/** A one-line view for list_jobs(), hiding the full brief and report. */
export type JobSummary = Pick<JobRecord, "id" | "type" | "status" | "costUsd"> & { goal: string; ageMs: number };

export function toSummary(r: JobRecord, now: number): JobSummary {
  return { id: r.id, type: r.type, status: r.status, costUsd: r.costUsd, goal: r.brief.goal, ageMs: now - r.startedAt };
}
