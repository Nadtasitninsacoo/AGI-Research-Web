export type SavedTaskPlan = {
  id: string;
  name: string;
  summary: string;
  updatedAt: string;
  status: "Ready" | "Draft" | "Archived";
};

export type SavedTaskPlansProps = {
  plans?: SavedTaskPlan[];
};

export function SavedTaskPlans({ plans = [] }: SavedTaskPlansProps) {
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
        Saved task plans
      </div>

      <div style={{ display: "grid", gap: 10, padding: 12 }}>
        {plans.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 12 }}>No saved plans yet.</div>
        ) : (
          plans.map((plan) => (
            <div
              key={plan.id}
              style={{
                border: "1px solid rgba(148,163,184,0.15)",
                borderRadius: 10,
                padding: "10px 12px",
                background: "rgba(15,23,42,0.55)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ color: "#f8fafc", fontWeight: 700, fontSize: 13 }}>{plan.name}</div>
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "4px 7px",
                    borderRadius: 999,
                    background:
                      plan.status === "Ready"
                        ? "rgba(34,197,94,0.12)"
                        : plan.status === "Draft"
                          ? "rgba(245,158,11,0.12)"
                          : "rgba(148,163,184,0.12)",
                    border:
                      plan.status === "Ready"
                        ? "1px solid rgba(34,197,94,0.35)"
                        : plan.status === "Draft"
                          ? "1px solid rgba(245,158,11,0.35)"
                          : "1px solid rgba(148,163,184,0.25)",
                    color:
                      plan.status === "Ready"
                        ? "#86efac"
                        : plan.status === "Draft"
                          ? "#fcd34d"
                          : "#cbd5e1",
                  }}
                >
                  {plan.status}
                </span>
              </div>

              <div style={{ color: "#cbd5e1", fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
                {plan.summary}
              </div>
              <div style={{ color: "#94a3b8", fontSize: 10, marginTop: 8 }}>{plan.updatedAt}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default SavedTaskPlans;
