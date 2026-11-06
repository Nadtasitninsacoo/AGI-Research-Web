export type TaskItem = {
  id: string;
  title: string;
  status: "Queued" | "Running" | "Completed" | "Blocked";
  owner: string;
  eta: string;
};

export type TaskWorkspaceProps = {
  title?: string;
  tasks?: TaskItem[];
};

const statusColors: Record<TaskItem["status"], string> = {
  Queued: "#93c5fd",
  Running: "#fbbf24",
  Completed: "#4ade80",
  Blocked: "#f87171",
};

export function TaskWorkspace({ title = "Task workspace", tasks = [] }: TaskWorkspaceProps) {
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
        {tasks.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 12 }}>No active tasks.</div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(148,163,184,0.15)",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <div>
                <div style={{ color: "#f8fafc", fontWeight: 700, fontSize: 13 }}>{task.title}</div>
                <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 4 }}>{task.owner}</div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: `${statusColors[task.status]}22`,
                    border: `1px solid ${statusColors[task.status]}55`,
                    color: statusColors[task.status],
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {task.status}
                </span>
                <span style={{ color: "#cbd5e1", fontSize: 11 }}>{task.eta}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default TaskWorkspace;
