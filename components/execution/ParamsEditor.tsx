import { Braces } from "lucide-react";

import { s } from "./classNames";

type Props = {
  value: string;
  onChange: (value: string) => void;
  valid: boolean;
  disabled: boolean;
};

export function ParamsEditor({ value, onChange, valid, disabled }: Props) {
  return (
    <div className={s.field}>
      <label htmlFor="params" className={s.label}>
        <Braces size={12} />
        PARAMETERS (JSON)
      </label>
      <div className={`${s.editor} ${valid ? "" : s.editorInvalid}`}>
        <div className={s.editorBar}>
          <span className={s.dots} aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className={s.fileName}>params.json</span>
          <span className={`${s.jsonState} ${valid ? s.jsonOk : s.jsonBad}`}>
            {valid ? "VALID OBJECT" : "INVALID JSON"}
          </span>
        </div>
        <textarea
          id="params"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={10}
          spellCheck={false}
          disabled={disabled}
          className={s.textarea}
        />
      </div>
    </div>
  );
}
