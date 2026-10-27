"use client";

import { useActionState, useEffect, useRef } from "react";
import { createExperimentAction } from "./actions";

export type Option = { id: number; label: string };

export function ExperimentForm({ projects, agents }: { projects: Option[]; agents: Option[] }) {
  const [state, action, pending] = useActionState(createExperimentAction, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="form">
      <label className="field">
        <span>PROJECT *</span>
        <select name="projectId" required defaultValue="">
          <option value="" disabled>select project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>AGENT</span>
        <select name="agentId" defaultValue="">
          <option value="">unassigned</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>NAME *</span>
        <input name="name" required maxLength={120} placeholder="e.g. zero-shot baseline" autoComplete="off" />
      </label>
      <label className="field">
        <span>HYPOTHESIS</span>
        <textarea name="hypothesis" rows={3} maxLength={5000} placeholder="what do you expect to learn" />
      </label>
      <div className="form-foot">
        <button type="submit" className="btn" disabled={pending || projects.length === 0}>
          {pending ? "CREATING..." : "CREATE EXPERIMENT"}
        </button>
        {state && <p className={`notice notice-${state.ok ? "ok" : "error"}`} role="status">{state.message}</p>}
      </div>
    </form>
  );
}
