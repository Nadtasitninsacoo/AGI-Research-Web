export type TargetRecord = {
  id: string;
  name: string;
  owner: string;
  status: string;
  risk: string;
  lastSeen: string;
};

export type TargetDatabaseProps = {
  title?: string;
  rows?: TargetRecord[];
};

export function TargetDatabase({ title = "Target database", rows = [] }: TargetDatabaseProps) {
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

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "rgba(15,23,42,0.9)", color: "#94a3b8" }}>
              <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Target</th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Owner</th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Status</th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Risk</th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 16, color: "#94a3b8", textAlign: "center" }}>
                  No targets available.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} style={{ borderTop: "1px solid rgba(148,163,184,0.12)" }}>
                  <td style={{ padding: "12px", color: "#f8fafc", fontWeight: 600 }}>{row.name}</td>
                  <td style={{ padding: "12px", color: "#cbd5e1" }}>{row.owner}</td>
                  <td style={{ padding: "12px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: "rgba(59,130,246,0.12)",
                        border: "1px solid rgba(96,165,250,0.32)",
                        color: "#bfdbfe",
                      }}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px", color: row.risk === "High" ? "#fca5a5" : "#fcd34d" }}>
                    {row.risk}
                  </td>
                  <td style={{ padding: "12px", color: "#cbd5e1" }}>{row.lastSeen}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TargetDatabase;
