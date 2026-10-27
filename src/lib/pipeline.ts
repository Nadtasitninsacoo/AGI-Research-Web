// Turns a run's raw logs into an ordered pipeline the UI can render as a flow
// diagram. Parsing is defensive: log wording comes from the engine, so an
// unrecognized line never breaks the flow — it just doesn't add a stage.
import type { RunLog, RunStatus } from "./types";

export type StepState = "pending" | "active" | "done" | "error";

export interface PipelineStep {
  key: string;
  label: string;
  state: StepState;
  detail?: string;
  /** Sub-counter, e.g. delegate 2/3 or 5 commands run. */
  progress?: string;
}

export interface Pipeline {
  steps: PipelineStep[];
  /** Number of findings/results surfaced so far (drives radar blips + toasts). */
  findings: number;
}

const asc = (a: RunLog, b: RunLog) => a.createdAt.localeCompare(b.createdAt);

/** First log whose message starts with `prefix` (case-insensitive). */
function find(logs: RunLog[], prefix: string): RunLog | undefined {
  const p = prefix.toLowerCase();
  return logs.find((l) => l.message.toLowerCase().startsWith(p));
}

export function buildPipeline(logs: RunLog[], status: RunStatus, findings: number): Pipeline {
  const sorted = [...logs].sort(asc);
  const running = status === "running";
  const final = status === "succeeded" || status === "failed" || status === "cancelled";

  const started = find(sorted, "run started");
  const plan = find(sorted, "hydra plan");
  const delegates = sorted.filter((l) => /^delegate\s+\d+\/\d+/i.test(l.message));
  const runs = sorted.filter((l) => /^run \[/i.test(l.message));
  const exits = sorted.filter((l) => /^exit\s+/i.test(l.message));
  const synthesis = find(sorted, "hydra synthesis");
  const crashed = status === "failed" || sorted.some((l) => l.level === "error");

  const steps: PipelineStep[] = [];
  const push = (s: PipelineStep) => steps.push(s);

  // 1. Queue — always done once anything after it exists or the run moved on.
  push({ key: "queue", label: "Queued", state: status === "queued" ? "active" : "done" });

  // 2. Boot
  if (started || running || final) {
    const detail = started?.message.replace(/^run started[.:]?\s*/i, "") || undefined;
    push({ key: "start", label: "Started", state: started || running || final ? "done" : "pending", detail });
  }

  // 3. Plan (HYDRA only)
  if (plan) {
    const n = plan.message.match(/\((\d+)\)/)?.[1];
    push({ key: "plan", label: "Planned", state: "done", progress: n ? `${n} tasks` : undefined });
  }

  // 4. Delegation (HYDRA only)
  if (delegates.length) {
    const last = delegates[delegates.length - 1];
    const m = last.message.match(/^delegate\s+(\d+)\/(\d+)/i);
    const allDone = m ? m[1] === m[2] && (synthesis || final) : final;
    push({
      key: "delegate",
      label: "Delegating",
      state: allDone ? "done" : "active",
      progress: m ? `${m[1]}/${m[2]}` : undefined,
      detail: last.message.replace(/^delegate\s+\d+\/\d+\s*->\s*/i, "").slice(0, 80),
    });
  }

  // 5. Execution — tool activity. Active while running with more runs than exits.
  if (runs.length || exits.length) {
    const failures = exits.filter((l) => /exit\s+(?!0\b)/i.test(l.message)).length;
    const active = running && runs.length > exits.length;
    push({
      key: "execute",
      label: "Scanning",
      state: active ? "active" : runs.length ? "done" : "pending",
      progress: `${exits.length}/${runs.length} cmd`,
      detail: failures ? `${failures} nonzero exit` : undefined,
    });
  }

  // 6. Synthesis (HYDRA only)
  if (synthesis) push({ key: "synthesis", label: "Synthesizing", state: final ? "done" : "active" });

  // 7. Outcome
  if (final) {
    push({
      key: "finish",
      label: status === "succeeded" ? "Finished" : status === "cancelled" ? "Cancelled" : "Failed",
      state: status === "succeeded" ? "done" : "error",
    });
  } else {
    push({ key: "finish", label: "Finish", state: "pending" });
  }

  // While running, the furthest non-final stage is the live one.
  if (running && !steps.some((s) => s.state === "active")) {
    const last = [...steps].reverse().find((s) => s.state === "done" && s.key !== "queue");
    if (last) last.state = "active";
  }

  if (crashed && status === "failed") {
    const live = steps.find((s) => s.state === "active");
    if (live) live.state = "error";
  }

  return { steps, findings };
}
