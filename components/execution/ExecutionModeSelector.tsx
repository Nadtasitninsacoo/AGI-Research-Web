import { Cpu, Target } from "lucide-react";

import type { RunMode } from "@/lib/execution/types";

import { s } from "./classNames";

type Props = {
  value: RunMode;
  onChange: (mode: RunMode) => void;
  disabled: boolean;
};

export function ExecutionModeSelector({ value, onChange, disabled }: Props) {
  return (
    <div className={s.field}>
      <label className={s.label}>
        <Cpu size={12} />
        EXECUTION MODE
      </label>

      <div className={s.row}>
        <button
          type="button"
          className={`${s.segBtn} ${value === "single" ? s.segBtnOn : ""}`}
          disabled={disabled}
          aria-pressed={value === "single"}
          onClick={() => onChange("single")}
        >
          <Cpu size={14} />
          SINGLE AGENT
        </button>

        <button
          type="button"
          className={`${s.segBtn} ${value === "team" ? s.segBtnOn : ""}`}
          disabled={disabled}
          aria-pressed={value === "team"}
          onClick={() => onChange("team")}
        >
          <Target size={14} />
          TEAM MODE
        </button>
      </div>
    </div>
  );
}
