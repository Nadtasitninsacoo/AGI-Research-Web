
import type {
  AgentStatus,
  TakeoverAgent,
  TakeoverData,
} from "./remote-session.types";
import { isRecord } from "./remote-session.utils";
import { resolveAgentApiBaseUrl } from "@/lib/agentApi";

const API_URL = resolveAgentApiBaseUrl(process.env.AGI_API_URL);

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAgent(value: unknown): TakeoverAgent | null {
  if (!isRecord(value)) return null;

  const id = toNumber(value.id, -1);
  const name = typeof value.name === "string" ? value.name : "";
  const allowedStatuses: AgentStatus[] = [
    "idle",
    "running",
    "paused",
    "error",
    "retired",
  ];
  const rawStatus = typeof value.status === "string" ? value.status : "idle";

  if (id < 0 || !name || !allowedStatuses.includes(rawStatus as AgentStatus)) {
    return null;
  }

  return {
    id,
    name,
    description: typeof value.description === "string" ? value.description : "",
    model: typeof value.model === "string" ? value.model : "Unknown",
    status: rawStatus as AgentStatus,
    runs: toNumber(value.runs),
    succeeded: toNumber(value.succeeded),
    failed: toNumber(value.failed),
    avgScore: value.avgScore == null ? null : toNumber(value.avgScore),
  };
}

export class AgentService {
  async getAgents(): Promise<{ agents: TakeoverAgent[]; agentMessage?: string }> {
    try {
      const response = await fetch(new URL("/api/agents", API_URL), {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        return { agents: [], agentMessage: "เชื่อมต่อ Agent API ไม่สำเร็จ" };
      }

      const payload: unknown = await response.json();

      if (!Array.isArray(payload)) {
        return { agents: [], agentMessage: "รูปแบบข้อมูล Agent API ไม่ถูกต้อง" };
      }

      return {
        agents: payload
          .map(parseAgent)
          .filter((agent): agent is TakeoverAgent => agent !== null),
      };
    } catch {
      return { agents: [], agentMessage: "อ่านข้อมูล Agent API ไม่สำเร็จ" };
    }
  }

  async getTakeoverData(): Promise<TakeoverData> {
    const agentsResult = await this.getAgents();

    return {
      ok: true,
      targets: [],
      agents: agentsResult.agents,
      agentMessage: agentsResult.agentMessage,
    };
  }
}

export const agentService = new AgentService();
