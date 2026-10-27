"use client";

import { useState } from "react";
import type { Pipeline, StepState } from "@/lib/pipeline";

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
  const active = pipeline.steps.find((s) => s.state === "active");

  return (
    <aside
      className={`flow ${open ? "flow-open" : "flow-min"} ${running ? "flow-running" : ""}`}
      aria-label="Run pipeline"
    >
      <header className="flow-head">
        <span className={`flow-live ${running ? "flow-live-on" : ""}`}>
          <i className="flow-dot" />
          {running ? "AGENT WORKING" : "AGENT IDLE"}
        </span>
        <button type="button" className="flow-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "–" : "+"}
        </button>
      </header>

      {open && (
        <div className="flow-body">
          <div className="flow-model">
            <span className="flow-k">MODEL</span>
            <span className="flow-v">{modelLabel}</span>
            {running && <span className="flow-thinking">thinking<i>.</i><i>.</i><i>.</i></span>}
          </div>

          <ol className="flow-steps">
            {pipeline.steps.map((s) => (
              <li key={s.key} className={`flow-step flow-${s.state}`}>
                <span className="flow-mark">{DOT[s.state]}</span>
                <span className="flow-label">
                  {s.label}
                  {s.progress && <em className="flow-prog">{s.progress}</em>}
                  {s.detail && <span className="flow-detail">{s.detail}</span>}
                </span>
              </li>
            ))}
          </ol>

          <footer className="flow-foot">
            <span>{pipeline.findings} found</span>
            <span>{active ? `→ ${active.label}` : running ? "starting…" : "—"}</span>
          </footer>
        </div>
      )}
    </aside>
  );
}
