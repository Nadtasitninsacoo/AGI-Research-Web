export type EventSeverity = "info" | "success" | "warning" | "error";

export type EventLogEntry = {
  id: string;
  time: string;
  severity: EventSeverity;
  message: string;
};

export type EventLogProps = {
  title?: string;
  entries?: EventLogEntry[];
};

const severityColors: Record<EventSeverity, { background: string; border: string; color: string }> = {
  info: { background: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.35)", color: "#bfdbfe" },
  success: { background: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)", color: "#86efac" },
  warning: { background: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)", color: "#fcd34d" },
  error: { background: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.35)", color: "#fca5a5" },
};

export function EventLog({ title = "Event log", entries = [] }: EventLogProps) {
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
        {title}
      </div>

      <div style={{ display: "grid", gap: 10, padding: 12 }}>
        {entries.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 12 }}>No events logged.</div>
        ) : (
          entries.map((entry) => {
            const palette = severityColors[entry.severity];

            return (
              <div
                key={entry.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "84px 1fr",
                  gap: 10,
                  alignItems: "start",
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(15,23,42,0.55)",
                  border: "1px solid rgba(148,163,184,0.14)",
                }}
              >
                <div style={{ color: "#94a3b8", fontSize: 11 }}>{entry.time}</div>
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      marginRight: 8,
                      padding: "3px 7px",
                      borderRadius: 999,
                      background: palette.background,
                      border: `1px solid ${palette.border}`,
                      color: palette.color,
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    {entry.severity}
                  </span>
                  <span style={{ color: "#e2e8f0", fontSize: 12, lineHeight: 1.5 }}>{entry.message}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default EventLog;
