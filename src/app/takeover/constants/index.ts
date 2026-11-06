
import type {
  EventItem,
  TaskType,
} from "../types";

export const TASK_STORAGE_KEY = "agi_takeover_tasks_v1";

export const SESSION_POLL_INTERVAL = 3000;
export const TELEMETRY_INTERVAL = 4000;
export const NOTIFICATION_DURATION = 5000;

export const taskLabels: Record<TaskType, string> = {
  EXPOSURE_REVIEW: "Review saved exposure metadata",
  PORT_SUMMARY: "Summarize saved ports and services",
  CVE_REVIEW: "Review recorded CVE metadata",
};

export const statusStyle: Record<string, string> = {
  idle: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  running: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  paused: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  error: "border-red-500/30 bg-red-500/10 text-red-400",
  retired: "border-slate-600 bg-slate-800 text-slate-500",
};

export const eventColor: Record<EventItem["type"], string> = {
  INFO: "text-cyan-400",
  SUCCESS: "text-emerald-400",
  WARNING: "text-amber-400",
  ERROR: "text-red-400",
};

export const initialEvents: EventItem[] = [
  {
    id: 1,
    time: "--:--:--",
    type: "INFO",
    message: "Takeover workspace initialized.",
  },
];
