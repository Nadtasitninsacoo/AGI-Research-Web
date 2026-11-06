import { ChevronDown, Cpu } from "lucide-react";

import type { Agent } from "@/lib/execution/types";

import { s } from "./classNames";

type Props = {
  agents: Agent[];
  value: string;
  onChange: (agentId: string) => void;
  disabled: boolean;
};

export function AgentSelector({ agents, value, onChange, disabled }: Props) {
  const selected = agents.find((item) => String(item.id) === value);

  return (
    <div className={s.field}>
      <label htmlFor="agent" className={s.label}>
        <Cpu size={12} />
        AGENT
      </label>
      <div className={s.selectWrap}>
        <select
          id="agent"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled || agents.length === 0}
          required
          className={s.select}
        >
          {agents.length === 0 && <option value="">no agents available</option>}
          {agents.map((agent) => (
            <option key={agent.id} value={String(agent.id)}>
              {agent.name}
              {agent.status ? ` — ${agent.status}` : ""}
            </option>
          ))}
        </select>
        <ChevronDown className={s.chev} />
      </div>
      <span className={s.hint}>
        {selected?.status ? `status: ${selected.status}` : ""}
      </span>
    </div>
  );
}
