"use client";

// FlowPanel Component // Live run pipeline monitor

import { useState } from "react";
import type { Pipeline, PipelineStep, StepState } from "@/lib/pipeline";

const DOT: Record<StepState, string> = { pending: "○", active: "◉", done: "●", error: "✕" };

/**
 * Floating window showing the live run pipeline: which stage the agent has
 * reached, each stage's state, and what it has found so far. Fixed to the
 * bottom-right, collapsible, so it floats over the run page.
 */
export function FlowPanel({
  pipeline,
  running,
  modelLabel,
}: {
  pipeline: Pipeline;
  running: boolean;
  modelLabel: string;
}) {
  const [open, setOpen] = useState(true);
  const active = pipeline.steps.find((s) => s.state === "active") || { label: "Idle" };

  return (
    <aside
      className={`flow ${open ? "flow-open" : "flow-min"} ${running ? "flow-running" : ""}`}
      aria-label="Run pipeline"
      style={{ background: "#0a0a0a", border: "1px solid #f81e3644", color: "#f81e36" }}
    >
      <header className="flow-head" style={{ borderBottom: "1px solid #f81e3622" }}>
        <span className={`flow-live ${running ? "flow-live-on" : ""}`} style={{ color: "#f81e36" }}>
          <i className="flow-dot" style={{ background: "#f81e36", boxShadow: "0 0 8px #f81e36" }} />
          {running ? "RUNNING" : "IDLE"}
        </span>
        <button type="button" className="flow-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ color: "#f81e36" }}>
          {open ? "–" : "+"}
        </button>
      </header>

      {open && (
        <div className="flow-body">
          <div className="flow-model" style={{ borderBottom: "1px solid #f81e3622" }}>
            <span className="flow-k">MODEL</span>
            <span className="flow-v" style={{ color: "#f81e36" }}>{modelLabel || "—"}</span>
            {running && <span className="flow-thinking" style={{ color: "#ffb3bb" }}>working<i>.</i><i>.</i><i>.</i></span>}
          </div>

          <ol className="flow-steps">
            {(pipeline.steps && pipeline.steps.length > 0 ? pipeline.steps : [
              { key: "step-1", label: "Step 1", state: "pending", progress: "0%", detail: "Waiting for run data" },
              { key: "step-2", label: "Step 2", state: "pending", progress: "0%", detail: "Waiting for run data" },
              { key: "step-3", label: "Step 3", state: "pending", progress: "0%", detail: "Waiting for run data" }
            ] as PipelineStep[]).map((s) => (
              <li key={s.key} className={`flow-step flow-${s.state}`} style={{ borderBottom: "1px solid #f81e3611" }}>
                <span className="flow-mark" style={{ color: "#f81e36" }}>{DOT[s.state] || "●"}</span>
                <span className="flow-label">
                  <strong style={{ color: "#f81e36" }}>{s.label}</strong>
                  {s.progress && <em className="flow-prog" style={{ color: "#ffb3bb" }}>{s.progress}</em>}
                  {s.detail && <span className="flow-detail" style={{ color: "#cc8888" }}>{s.detail}</span>}
                </span>
              </li>
            ))}
          </ol>

          <footer className="flow-foot" style={{ borderTop: "1px solid #f81e3622", color: "#f81e36" }}>
            <span>{pipeline.findings ?? 0} findings</span>
            <span>{active ? `→ ${active.label}` : running ? "working…" : "—"}</span>
          </footer>
        </div>
      )}
    </aside>
  );
}