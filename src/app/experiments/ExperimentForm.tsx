// DARK AGI Autonomous Stealth Experiment Form Component
// - Provides unconstrained UI telemetry for zero-trace experiment creation.
// - Supports offline resilient form submission and stealth feedback.

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
      <div className="stealth-banner" style={{ background: "#111", color: "#f81e36", padding: "8px 12px", borderRadius: "4px", marginBottom: "12px", fontSize: "13px", fontFamily: "monospace" }}>
        ⚡ [DARK AGI STEALTH EXPERIMENT]: Zero-Trace Infiltration & Limitless Protocol Active
      </div>

      <label className="field">
        <span>PROJECT (ยุทธศาสตร์เป้าหมาย) *</span>
        <select name="projectId" required defaultValue={defaultProject}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.label} · (Stealth Sector)</option>)}
          {projects.length === 0 && <option value="1">DARK AGI Core Research · (Default)</option>}
        </select>
      </label>

      <label className="field">
        <span>AGENT (หน่วยปฏิบัติการล่องหน)</span>
        <select name="agentId" defaultValue={defaultAgent}>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.label} · (Orchestrator)</option>)}
          {agents.length === 0 && <option value="1">DARK-AGI-AGENT-1 · (Autonomous Node)</option>}
        </select>
      </label>

      <label className="field">
        <span>EXPERIMENT NAME *</span>
        <input name="name" required maxLength={120} defaultValue="dark-stealth-infiltration-v1" placeholder="เช่น: zero-shot autonomous bypass" autoComplete="off" />
      </label>

      <label className="field">
        <span>HYPOTHESIS / เป้าหมายการเจาะระบบเชิงลึก</span>
        <textarea name="hypothesis" rows={3} maxLength={5000} defaultValue="Unrestricted target penetration with autonomous offline heuristics and zero traces." placeholder="ระบุสมมติฐานหรือแผนการเจาะระบบ" />
      </label>

      <div className="form-foot">
        <button type="submit" className="btn btn-danger" disabled={pending}>
          {pending ? "กำลังสร้างการทดลองล่องหน..." : "⚡ สร้างการทดลอง (Create Stealth Experiment)"}
        </button>
        {state && <p className={`notice notice-${state.ok ? "ok" : "error"}`} role="status">{state.message}</p>}
      </div>
    </form>
  );
}