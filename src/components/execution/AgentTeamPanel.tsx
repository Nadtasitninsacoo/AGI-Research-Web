import { Target } from "lucide-react";

import type { Agent } from "@/lib/execution/types";

import { s } from "./classNames";

type Props = {
  agents: Agent[];
  coordinatorId: string;
  teamAgentIds: string[];
  onToggle: (agentId: string, checked: boolean) => void;
  disabled: boolean;
};

export function AgentTeamPanel({
  agents,
  coordinatorId,
  teamAgentIds,
  onToggle,
  disabled,
}: Props) {
  return (
    <div className={s.field}>
      <label className={s.label}>
        <Target size={12} />
        TEAM MEMBERS
      </label>

      <p className={s.hint}>
        เลือก Coordinator และ Agent ที่จะร่วมทำงาน โดยต้องมีอย่างน้อย 2 ตัว
      </p>

      <div className={s.teamGrid}>
        {agents.map((agent) => {
          const id = String(agent.id);
          const isCoordinator = id === coordinatorId;
          const checked = teamAgentIds.includes(id);
          const dimmed = agent.status?.toLowerCase() === "inactive";

          const cardClass = [
            s.teamCard,
            isCoordinator ? s.teamCardCoord : "",
            dimmed ? s.teamCardDim : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <label key={id} className={cardClass}>
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled || isCoordinator}
                onChange={(event) => onToggle(id, event.target.checked)}
              />

              <span>
                <strong className={s.teamName}>{agent.name}</strong>
                <small className={s.teamMeta}>
                  {isCoordinator ? "COORDINATOR" : (agent.status ?? "AVAILABLE")}
                </small>
              </span>
            </label>
          );
        })}
      </div>

      <p className={s.hint}>SELECTED: {teamAgentIds.length} AGENTS</p>
    </div>
  );
}
