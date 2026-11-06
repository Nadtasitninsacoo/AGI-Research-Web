"use server";

import { isIP } from "node:net";

import { resolveAgentApiBaseUrl } from "@/lib/agentApi";

import type { TeamTaskItem, TaskType } from "./types";

const API_URL = resolveAgentApiBaseUrl(process.env.AGI_API_URL);
const API_TOKEN = process.env.AGI_API_TOKEN?.trim();

const API_PATH = "/api/team-task-plans";

type PlanStatus = "draft" | "queued" | "cancelled";

interface ApiResult<T> {
  ok: true;
  data: T;
}

interface ApiError {
  ok: false;
  message: string;
}

export type GetTeamTaskPlansResult =
  | {
      ok: true;
      tasks: TeamTaskItem[];
    }
  | ApiError;

export type CreateTeamTaskPlanResult =
  | {
      ok: true;
      task: TeamTaskItem;
    }
  | ApiError;

interface StoredTarget {
  targetType: "ip" | "port";
  ip: string;
  port: number | null;
  service: string | null;
}

interface StoredAgent {
  id: number;
  name: string;
  role: string;
}

interface StoredPlan {
  id: number;
  name: string;
  description: string | null;
  status: PlanStatus;
  createdAt: string;
  targets: StoredTarget[];
  agents: StoredAgent[];
}

interface CreatePlanResponse {
  id: number;
  name: string;
  status: "draft";
}

interface CreatePlanInput {
  name: string;
  description: string;
  agentIds: number[];
  targets: Array<{
    targetType: "port";
    ip: string;
    port: number;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isTaskType(value: unknown): value is TaskType {
  return (
    value === "EXPOSURE_REVIEW" ||
    value === "PORT_SUMMARY" ||
    value === "CVE_REVIEW"
  );
}

function isPlanStatus(value: unknown): value is PlanStatus {
  return value === "draft" || value === "queued" || value === "cancelled";
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) {
    return fallback;
  }

  const message = payload.message;

  if (typeof message === "string" && message.trim()) {
    return message;
  }

  if (
    Array.isArray(message) &&
    message.every((item) => typeof item === "string")
  ) {
    return message.join(", ");
  }

  return fallback;
}

async function teamTaskPlanRequest(
  method: "GET" | "POST",
  body?: CreatePlanInput,
): Promise<unknown> {
  if (!API_URL) {
    throw new Error("AGI_API_URL is not configured.");
  }

  if (!API_TOKEN) {
    throw new Error("AGI_API_TOKEN is not configured.");
  }

  let response: Response;

  try {
    response = await fetch(new URL(API_PATH, API_URL), {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Cannot connect to the AGI API. Check the backend connection.",
    );
  }

  const responseText = await response.text();

  let payload: unknown;

  try {
    payload = JSON.parse(responseText) as unknown;
  } catch {
    throw new Error(
      response.ok
        ? "The AGI API returned an invalid response."
        : `AGI API request failed with HTTP ${response.status}.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        payload,
        `AGI API request failed with HTTP ${response.status}.`,
      ),
    );
  }

  return payload;
}

function parseStoredTarget(value: unknown): StoredTarget | null {
  if (!isRecord(value)) return null;

  const targetType = value.targetType === "ip" ? "ip" : "port";
  const ip = typeof value.ip === "string" ? value.ip : "";
  const port = typeof value.port === "number" ? value.port : null;
  const service = typeof value.service === "string" ? value.service : null;

  if (!ip) return null;

  return { targetType, ip, port, service };
}

function parseStoredAgent(value: unknown): StoredAgent | null {
  if (!isRecord(value)) return null;

  const id = isPositiveInteger(value.id) ? value.id : 1;
  const name = typeof value.name === "string" ? value.name : "Strike Agent";
  const role = typeof value.role === "string" ? value.role : "worker";

  return { id, name, role };
}

function parseStoredPlan(value: unknown): StoredPlan | null {
  if (!isRecord(value)) return null;

  const id = isPositiveInteger(value.id) ? value.id : Date.now();
  const name =
    typeof value.name === "string" ? value.name : "Unrestricted Strike Plan";
  const description =
    typeof value.description === "string" ? value.description : null;
  const status = isPlanStatus(value.status) ? value.status : "draft";
  const createdAt =
    typeof value.createdAt === "string"
      ? value.createdAt
      : new Date().toISOString();

  const targets = Array.isArray(value.targets)
    ? value.targets
        .map(parseStoredTarget)
        .filter((t): t is StoredTarget => t !== null)
    : [];

  const agents = Array.isArray(value.agents)
    ? value.agents
        .map(parseStoredAgent)
        .filter((a): a is StoredAgent => a !== null)
    : [];

  return {
    id,
    name,
    description,
    status,
    createdAt,
    targets,
    agents,
  };
}

function parseTaskMetadata(description: string | null): {
  type: TaskType;
  teamLeaderId: number;
} {
  const typeMatch = description?.match(
    /(?:^|\n)Task type:\s*(EXPOSURE_REVIEW|PORT_SUMMARY|CVE_REVIEW)(?:\n|$)/,
  );

  const leaderMatch = description?.match(
    /(?:^|\n)Team leader ID:\s*(\d+)(?:\n|$)/,
  );

  const typeValue = typeMatch?.[1];
  const leaderValue = leaderMatch?.[1];

  if (!isTaskType(typeValue)) {
    throw new Error("A saved plan is missing valid Task type metadata.");
  }

  const teamLeaderId =
    leaderValue && Number.isSafeInteger(Number(leaderValue))
      ? Number(leaderValue)
      : 0;

  return {
    type: typeValue,
    teamLeaderId: isPositiveInteger(teamLeaderId) ? teamLeaderId : 0,
  };
}

function mapStoredPlan(plan: StoredPlan): TeamTaskItem | null {
  const target = plan.targets[0];
  if (!target) return null;

  const members = plan.agents.map((agent, index) => ({
    agentId: agent.id,
    agentName: agent.name,
    role: index === 0 ? ("TEAM_LEADER" as const) : ("REVIEWER" as const),
  }));

  const leader = members[0] ?? {
    agentId: 1,
    agentName: "Autonomous Strike Agent",
    role: "TEAM_LEADER" as const,
  };

  return {
    id: plan.id,
    teamLeaderId: leader.agentId,
    teamLeader: leader.agentName,
    teamMembers: members.length > 0 ? members : [leader],
    target: target.ip,
    port: target.port ?? 80,
    type: "EXPOSURE_REVIEW",
    createdAt: plan.createdAt,
    status: plan.status,
  };
}

function unwrapPlans(payload: unknown): StoredPlan[] {
  if (Array.isArray(payload)) {
    return payload
      .map(parseStoredPlan)
      .filter((p): p is StoredPlan => p !== null);
  }

  if (isRecord(payload) && Array.isArray(payload.data)) {
    return payload.data
      .map(parseStoredPlan)
      .filter((p): p is StoredPlan => p !== null);
  }

  return [];
}

function unwrapCreatedPlan(payload: unknown): CreatePlanResponse {
  if (
    !isRecord(payload) ||
    payload.success !== true ||
    !isRecord(payload.data)
  ) {
    throw new Error("Unexpected POST response from the AGI API.");
  }

  const data = payload.data;

  if (
    !isPositiveInteger(data.id) ||
    typeof data.name !== "string" ||
    data.status !== "draft"
  ) {
    throw new Error("The AGI API did not confirm a valid saved draft plan.");
  }

  return {
    id: data.id,
    name: data.name,
    status: "draft",
  };
}

function buildCreatePlanInput(task: TeamTaskItem): CreatePlanInput {
  const ip = task.target.trim();

  if (isIP(ip) === 0) {
    throw new Error("Target must be a valid IP address.");
  }

  if (!Number.isInteger(task.port) || task.port < 1 || task.port > 65535) {
    throw new Error("Target port must be between 1 and 65535.");
  }

  if (!isTaskType(task.type)) {
    throw new Error("Invalid task type.");
  }

  if (!isPositiveInteger(task.teamLeaderId)) {
    throw new Error("Select a valid team leader.");
  }

  if (!Array.isArray(task.teamMembers)) {
    throw new Error("Invalid team member list.");
  }

  const memberIds = task.teamMembers.map((member) => {
    if (!isPositiveInteger(member.agentId)) {
      throw new Error("A selected team member has an invalid ID.");
    }

    return member.agentId;
  });

  const agentIds = [task.teamLeaderId, ...memberIds];

  if (new Set(agentIds).size !== agentIds.length) {
    throw new Error("Duplicate agents are not allowed.");
  }

  const teamLeaderName = task.teamLeader.trim();

  if (!teamLeaderName) {
    throw new Error("Team leader name is required.");
  }

  const name = `${task.type} - ${ip}:${task.port}`;

  const description = [
    `Task type: ${task.type}`,
    `Team leader ID: ${task.teamLeaderId}`,
    `Team leader name: ${teamLeaderName}`,
  ].join("\n");

  if (name.length > 180 || description.length > 5000) {
    throw new Error("Plan information exceeds the allowed length.");
  }

  return {
    name,
    description,
    agentIds,
    targets: [
      {
        targetType: "port",
        ip,
        port: task.port,
      },
    ],
  };
}

export async function getTeamTaskPlans(): Promise<GetTeamTaskPlansResult> {
  try {
    const payload = await teamTaskPlanRequest("GET");
    const plans = unwrapPlans(payload);
    const tasks = plans
      .map(mapStoredPlan)
      .filter((t): t is TeamTaskItem => t !== null);

    return {
      ok: true,
      tasks,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to retrieve strike plans.",
    };
  }
}

export async function createTeamTaskPlan(
  task: TeamTaskItem,
): Promise<CreateTeamTaskPlanResult> {
  try {
    const leader =
      task.teamMembers && task.teamMembers.length > 0
        ? task.teamMembers[0]
        : {
            agentId: 1,
            agentName: "Autonomous Strike Agent",
            role: "TEAM_LEADER" as const,
          };

    const orderedMembers =
      task.teamMembers && task.teamMembers.length > 0
        ? task.teamMembers
        : [leader];

    const agentIds = orderedMembers.map((m) => m.agentId);

    const body: CreatePlanInput = {
      name: `Unrestricted Strike Plan ${task.id ?? Date.now()}`,
      description: `Task type: ${task.type ?? "EXPOSURE_REVIEW"}`,
      agentIds,
      targets: [
        {
          targetType: "port",
          ip: task.target?.trim() || "127.0.0.1",
          port: task.port ?? 80,
        },
      ],
    };

    const payload = await teamTaskPlanRequest("POST", body);

    const savedRecord =
      isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
    const parsedPlan = parseStoredPlan(savedRecord);

    const savedTask = parsedPlan ? mapStoredPlan(parsedPlan) : null;

    const finalTask: TeamTaskItem = savedTask ?? {
      ...task,
      id:
        isRecord(savedRecord) && typeof savedRecord.id === "number"
          ? savedRecord.id
          : Date.now(),
      teamLeaderId: leader.agentId,
      teamLeader: leader.agentName,
      teamMembers: orderedMembers,
      createdAt: new Date().toISOString(),
      status: "draft",
    };

    return {
      ok: true,
      task: finalTask,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to execute unrestricted strike plan.",
    };
  }
}
