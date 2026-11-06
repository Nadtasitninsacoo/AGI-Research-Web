export type ConnectionStatusProps = {
  label?: string;
  status?: "online" | "degraded" | "offline";
  endpoint?: string;
  latency?: string;
  uptime?: string;
};

const statusColors: Record<NonNullable<ConnectionStatusProps["status"]>, { background: string; border: string; color: string }> = {
  online: { background: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.3)", color: "#86efac" },
  degraded: { background: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", color: "#fcd34d" },
  offline: { background: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)", color: "#fca5a5" },
};

export function ConnectionStatus({
  label = "Connection",
  status = "online",
  endpoint = "n/a",
  latency = "0 ms",
  uptime = "--",
}: ConnectionStatusProps) {
  const palette = statusColors[status];

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
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid rgba(148,163,184,0.18)",
        }}
      >
        <div style={{ color: "#f8fafc", fontWeight: 700, fontSize: 13 }}>{label}</div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 999,
            background: palette.background,
            border: `1px solid ${palette.border}`,
            color: palette.color,
            fontSize: 10,
            fontWeight: 700,
            textTransform: "capitalize",
          }}
        >
          <span style={{ width: 7, height: 7, display: "inline-block", borderRadius: "50%", background: palette.color }} />
          {status}
        </span>
      </div>

      <div style={{ padding: 12, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "#94a3b8" }}>Endpoint</span>
          <span style={{ color: "#e2e8f0" }}>{endpoint}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "#94a3b8" }}>Latency</span>
          <span style={{ color: "#e2e8f0" }}>{latency}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "#94a3b8" }}>Uptime</span>
          <span style={{ color: "#e2e8f0" }}>{uptime}</span>
        </div>
      </div>
    </div>
  );
}

export default ConnectionStatus;
