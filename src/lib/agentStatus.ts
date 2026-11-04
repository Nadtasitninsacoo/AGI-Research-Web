// Honest, shared mapping from an agent's real DB status to a display label and
// a tone (used for dot/colour classes). The agents.status enum is:
// 'idle' | 'running' | 'paused' | 'error' | 'retired'.
//
// An idle agent that is online is available to be assigned, so it reads as
// READY rather than a dull "IDLE". A running agent is WORKING. Everything else
// reflects the stored state verbatim — never a fabricated "online" look.

export type AgentStatusTone =
  | "ready"
  | "running"
  | "paused"
  | "error"
  | "retired"
  | "idle";

export type AgentStatusMeta = {
  label: string;
  tone: AgentStatusTone;
};

export function agentStatusMeta(
  status: string | null | undefined,
): AgentStatusMeta {
  switch ((status ?? "").toLowerCase()) {
    case "running":
      return { label: "WORKING", tone: "running" };
    case "paused":
      return { label: "PAUSED", tone: "paused" };
    case "error":
      return { label: "ERROR", tone: "error" };
    case "retired":
      return { label: "RETIRED", tone: "retired" };
    case "idle":
      return { label: "READY", tone: "ready" };
    default:
      return { label: (status ?? "UNKNOWN").toUpperCase(), tone: "idle" };
  }
}
