"use client";

import { useActionState, useEffect, useRef } from "react";
import { createAgentAction } from "./actions";

export function AgentForm() {
  const [state, action, pending] = useActionState(createAgentAction, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="form">
      <div className="field-row">
        <label className="field">
          <span>NAME *</span>
          <input name="name" required maxLength={120} placeholder="e.g. OMEGA-9" autoComplete="off" />
        </label>
        <label className="field">
          <span>MODEL</span>
          <input name="model" maxLength={120} placeholder="e.g. claude-sonnet-5-5" autoComplete="off" />
        </label>
      </div>
      <label className="field">
        <span>DESCRIPTION</span>
        <textarea name="description" rows={2} maxLength={5000} placeholder="role and purpose" />
      </label>
      <label className="field">
        <span>CONFIG (JSON OBJECT)</span>
        <textarea name="config" rows={2} placeholder='{"temperature": 0.2}' spellCheck={false} className="mono" />
      </label>
      <div className="form-foot">
        <button type="submit" className="btn" disabled={pending}>{pending ? "REGISTERING..." : "REGISTER AGENT"}</button>
        {state && <p className={`notice notice-${state.ok ? "ok" : "error"}`} role="status">{state.message}</p>}
      </div>
    </form>
  );
}
