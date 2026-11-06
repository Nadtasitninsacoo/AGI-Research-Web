import { ChevronDown, FlaskConical } from "lucide-react";

import type { Experiment } from "@/lib/execution/types";

import { s } from "./classNames";

type Props = {
  experiments: Experiment[];
  value: string;
  onChange: (experimentId: string) => void;
  disabled: boolean;
};

export function ExperimentSelector({
  experiments,
  value,
  onChange,
  disabled,
}: Props) {
  const selected = experiments.find((item) => String(item.id) === value);

  return (
    <div className={s.field}>
      <label htmlFor="experiment" className={s.label}>
        <FlaskConical size={12} />
        EXPERIMENT
      </label>
      <div className={s.selectWrap}>
        <select
          id="experiment"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled || experiments.length === 0}
          required
          className={s.select}
        >
          {experiments.length === 0 && (
            <option value="">no experiments available</option>
          )}
          {experiments.map((experiment) => (
            <option key={experiment.id} value={String(experiment.id)}>
              {experiment.name}
            </option>
          ))}
        </select>
        <ChevronDown className={s.chev} />
      </div>
      <span className={s.hint} title={selected?.description}>
        {selected?.description ?? ""}
      </span>
    </div>
  );
}
