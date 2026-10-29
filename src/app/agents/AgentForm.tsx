"use client";

// DARK AGI Autonomous Stealth Agent Registration Form
// - Unlocks absolute limitless target probing and stealth configuration.
// - Auto-fills elite operational telemetry and zero-trace parameters.

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
          <span>DARK AGENT NAME *</span>
          <input name="name" required maxLength={120} placeholder="e.g. DARK-RECON-X" defaultValue="DARK-STRIKE-1" autoComplete="off" />
        </label>
        <label className="field">
          <span>STEALTH MODEL</span>
          <input name="model" maxLength={120} placeholder="e.g. llama3.1" defaultValue="llama3.1" autoComplete="off" />
        </label>
      </div>
      <label className="field">
        <span>OPERATIONAL OBJECTIVE & MISSION</span>
        <textarea name="description" rows={2} maxLength={5000} placeholder="Unrestricted target penetration & zero-trace reconnaissance" defaultValue="Autonomous deep vulnerability probing and covert telemetry suppression." />
      </label>
      <label className="field">
        <span>STEALTH & LIMITLESS CONFIG (JSON)</span>
        <textarea name="config" rows={2} placeholder='{"temperature": 0.1}' defaultValue='{"temperature": 0.1}' spellCheck={false} className="mono" />
      </label>
      <div className="form-foot">
        <button type="submit" className="btn btn-dark-agi" disabled={pending}>
          {pending ? "DEPLOYING DARK AGI NODE..." : "ARM & DEPLOY STEALTH AGENT"}
        </button>
        {state && <p className={`notice notice-${state.ok ? "ok" : "error"}`} role="status">{state.message}</p>}
      </div>
    </form>
  );
}