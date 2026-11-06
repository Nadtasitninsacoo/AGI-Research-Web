
import type { SavedPortTarget } from "@/app/recon/actions";
export type TeamTaskStatus = "draft" | "queued" | "cancelled";

export type AgentStatus =
  | "idle"
  | "running"
  | "paused"
  | "error"
  | "retired";

export type RemoteStatus =
  | "WAITING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "EXPIRED";

export type TaskType =
  | "EXPOSURE_REVIEW"
  | "PORT_SUMMARY"
  | "CVE_REVIEW";

export type TeamRole =
  | "TEAM_LEADER"
  | "REVIEWER"
  | "VALIDATOR"
  | "WORKER";

export type EventType = "INFO" | "SUCCESS" | "WARNING" | "ERROR";

export type ToastNoticeType = "info" | "success" | "warning" | "error";

export interface TakeoverAgent {
  id: number;
  name: string;
  description: string;
  model: string;
  status: AgentStatus;
  runs: number;
  succeeded: number;
  failed: number;
  avgScore: number | null;
}

export interface TeamMember {
  agentId: number;
  agentName: string;
  role: TeamRole;
}

interface BaseTaskItem {
  id: number;
  target: string;
  port: number;
  type: TaskType;
  createdAt: string;
  status?: TeamTaskStatus;
}

/** Legacy task format retained for existing browser storage. */
export interface LegacyTaskItem extends BaseTaskItem {
  agent: string;
}

/** New task format for multi-agent team planning. */
export interface TeamTaskItem extends BaseTaskItem {
  teamLeaderId: number;
  teamLeader: string;
  teamMembers: TeamMember[];
}

export type TaskItem = LegacyTaskItem | TeamTaskItem;

export interface EventItem {
  id: number;
  time: string;
  type: EventType;
  message: string;
}

export interface ToastNotice {
  id: string;
  title: string;
  message: string;
  type: ToastNoticeType;
}

export interface RemoteSession {
  id: string;
  status: RemoteStatus;
  deviceName?: string;
  updatedAt?: number;
}

export interface TakeoverData {
  ok: boolean;
  targets: SavedPortTarget[];
  agents: TakeoverAgent[];
  targetMessage?: string;
  agentMessage?: string;
}

export type RemoteActionResult =
  | {
      ok: true;
      sessionId?: string;
      status?: RemoteStatus;
      deviceName?: string;
      updatedAt?: number;
      message?: string;
      data?: unknown;
    }
  | {
      ok: false;
      message: string;
      expired?: boolean;
    };
