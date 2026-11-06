"use client";

// Agent registration form
// - Fields for registering a research agent and its configuration.

import { useActionState, useEffect, useRef } from "react";
import { createAgentAction } from "./actions";

export function AgentForm() {
  const [state, action, pending] = useActionState(createAgentAction, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="form dark-agi-form">
      <div className="field-row">
        <label className="field">
          <span>AGENT NAME *</span>
          <input name="name" required maxLength={120} placeholder="e.g. recon-agent" defaultValue="agent-1" autoComplete="off" />
        </label>
        <label className="field">
          <span>MODEL</span>
          <input name="model" maxLength={120} placeholder="e.g. llama3.1" defaultValue="llama3.1" autoComplete="off" />
        </label>
      </div>
      <label className="field">
        <span>DESCRIPTION & OBJECTIVE</span>
        <textarea name="description" rows={2} maxLength={5000} placeholder="Describe the agent's task" defaultValue="Authorized reconnaissance task." />
      </label>
      <label className="field">
        <span>CONFIG (JSON)</span>
        <textarea name="config" rows={2} placeholder='{"temperature": 0.1}' defaultValue='{"temperature": 0.1}' spellCheck={false} className="mono" />
      </label>
      <div className="form-foot">
        <button type="submit" className="btn btn-dark-agi" disabled={pending}>
          {pending ? "Creating agent..." : "Create Agent"}
        </button>
        {state && <p className={`notice notice-${state.ok ? "ok" : "error"}`} role="status">{state.message}</p>}
      </div>
    </form>
  );
}