// Experiment form component
// - UI for creating a research experiment.
// - Supports offline-resilient form submission and feedback.

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

  const defaultProject = projects[0]?.id ? String(projects[0].id) : "1";
  const defaultAgent = agents[0]?.id ? String(agents[0].id) : "1";

  return (
    <form ref={ref} action={action} className="form">
      <label className="field">
        <span>PROJECT (โครงการ) *</span>
        <select name="projectId" required defaultValue={defaultProject}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          {projects.length === 0 && <option value="1">AGI Research · (Default)</option>}
        </select>
      </label>

      <label className="field">
        <span>AGENT (หน่วยปฏิบัติการ)</span>
        <select name="agentId" defaultValue={defaultAgent}>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.label} · (Orchestrator)</option>)}
          {agents.length === 0 && <option value="1">agent-1 · (Default)</option>}
        </select>
      </label>

      <label className="field">
        <span>EXPERIMENT NAME *</span>
        <input name="name" required maxLength={120} defaultValue="experiment-1" placeholder="เช่น: zero-shot baseline" autoComplete="off" />
      </label>

      <label className="field">
        <span>HYPOTHESIS / สมมติฐาน</span>
        <textarea name="hypothesis" rows={3} maxLength={5000} defaultValue="" placeholder="ระบุสมมติฐานหรือแผนการทดลอง" />
      </label>

      <div className="form-foot">
        <button type="submit" className="btn btn-danger" disabled={pending}>
          {pending ? "กำลังสร้างการทดลอง..." : "สร้างการทดลอง (Create Experiment)"}
        </button>
        {state && <p className={`notice notice-${state.ok ? "ok" : "error"}`} role="status">{state.message}</p>}
      </div>
    </form>
  );
}