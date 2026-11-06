export type RegisteredAgent = {
  id: string;
  name: string;
  model: string;
  status: "online" | "idle" | "busy" | "offline";
  runs: number;
};

export type RegisteredAgentsProps = {
  agents?: RegisteredAgent[];
};

const statusColors: Record<RegisteredAgent["status"], { background: string; border: string; color: string }> = {
  online: { background: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.3)", color: "#86efac" },
  idle: { background: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.3)", color: "#cbd5e1" },
  busy: { background: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", color: "#fcd34d" },
  offline: { background: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)", color: "#fca5a5" },
};

export function RegisteredAgents({ agents = [] }: RegisteredAgentsProps) {
  return (
    <div
      style={{
        background: "rgba(15,23,42,0.8)",
        border: "1px solid rgba(148,163,184,0.18)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid rgba(148,163,184,0.18)",
          fontSize: 13,
          fontWeight: 700,
          color: "#f8fafc",
        }}
      >
        Registered agents
      </div>

      <div style={{ display: "grid", gap: 10, padding: 12 }}>
        {agents.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 12 }}>No registered agents.</div>
        ) : (
          agents.map((agent) => {
            const status = statusColors[agent.status];

            return (
              <div
                key={agent.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(15,23,42,0.55)",
                  border: "1px solid rgba(148,163,184,0.15)",
                }}
              >
                <div>
                  <div style={{ color: "#f8fafc", fontWeight: 700, fontSize: 13 }}>{agent.name}</div>
                  <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 4 }}>{agent.model}</div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: status.background,
                      border: `1px solid ${status.border}`,
                      color: status.color,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "capitalize",
                    }}
                  >
                    {agent.status}
                  </span>
                  <span style={{ color: "#cbd5e1", fontSize: 11 }}>{agent.runs} runs</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default RegisteredAgents;
