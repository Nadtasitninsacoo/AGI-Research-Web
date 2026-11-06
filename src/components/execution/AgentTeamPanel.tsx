import { Target, Radar, Brain, Ghost, Swords, ShieldAlert, Network, Cpu, type LucideIcon } from "lucide-react";

import type { Agent } from "@/lib/execution/types";

import { s } from "./classNames";

/** A distinct, on-brand icon + accent colour per agent (fallbacks to Cpu). */
function agentLook(name: string): { Icon: LucideIcon; color: string } {
  const n = (name ?? "").toUpperCase();
  if (n.includes("RECON")) return { Icon: Radar, color: "#2de2e6" };
  if (n.includes("ORACLE")) return { Icon: Brain, color: "#a78bfa" };
  if (n.includes("WRAITH")) return { Icon: Ghost, color: "#93c5fd" };
  if (n.includes("NEMESIS")) return { Icon: Swords, color: "#f87171" };
  if (n.includes("CERBERUS")) return { Icon: ShieldAlert, color: "#fbbf24" };
  if (n.includes("HYDRA")) return { Icon: Network, color: "#34d399" };
  return { Icon: Cpu, color: "#9aa0aa" };
}

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

          const { Icon, color } = agentLook(agent.name);

          return (
            <label key={id} className={cardClass}>
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled || isCoordinator}
                onChange={(event) => onToggle(id, event.target.checked)}
              />

              <span className={s.teamIcon} style={{ color }}>
                <Icon size={17} />
              </span>

              <span>
                <strong className={s.teamName} style={{ color }}>{agent.name}</strong>
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
