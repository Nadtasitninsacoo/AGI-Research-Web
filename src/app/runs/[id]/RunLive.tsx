
"use client";

import Link from "next/link";
import {
  type ReactNode,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { StatusTag } from "@/components/hud/StatusTag";
import { Radar } from "@/components/hud/Radar";
import { LiveActivityPanel } from "@/components/hud/LiveActivityPanel";
import { ToastStack, type ToastItem } from "@/components/hud/Toast";
import { fmtDate, fmtDuration } from "@/lib/format";
import { isRunFinal, type FormState, type RunSnapshot } from "@/lib/types";
import { cancelRunAction } from "../actions";

const POLL_MS = 4000;

const SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const;

type Severity = (typeof SEVERITIES)[number];

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "วิกฤต",
  high: "สูง",
  medium: "ปานกลาง",
  low: "ต่ำ",
  info: "ข้อมูล",
};

function detailStr(details: unknown, key: string): string {
  if (!details || typeof details !== "object") return "";

  const value = (details as Record<string, unknown>)[key];

  return value == null ? "" : String(value);
}

function normalizeSeverity(value: string): Severity {
  const normalized = value.toLowerCase();

  return SEVERITIES.includes(normalized as Severity)
    ? (normalized as Severity)
    : "info";
}

function isRunning(status: string): boolean {
  return status.toLowerCase() === "running";
}

function isQueued(status: string): boolean {
  return status.toLowerCase() === "queued";
}

export function RunLive({
  initial,
  experimentCell,
  agentCell,
  paramsCell,
}: {
  initial: RunSnapshot;
  experimentCell: ReactNode;
  agentCell: ReactNode;
  paramsCell: ReactNode;
}) {
  const [snap, setSnap] = useState(initial);
  const [stale, setStale] = useState(false);

  const { run, logs, logsTotal, evaluations } = snap;

  const final = isRunFinal(run.status);
  const running = isRunning(run.status);
  const queued = isQueued(run.status);
  const id = run.id;

  // Toast notifications
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);
  const prevFindings = useRef(evaluations.length);
  const prevStatus = useRef(run.status);

  const pushToast = useCallback((toast: Omit<ToastItem, "id">) => {
    setToasts((current) =>
      [
        ...current,
        {
          ...toast,
          id: ++toastSeq.current,
        },
      ].slice(-4),
    );
  }, []);

  const dismissToast = useCallback((toastId: number) => {
    setToasts((current) =>
      current.filter((toast) => toast.id !== toastId),
    );
  }, []);

  useEffect(() => {
    const added = evaluations.length - prevFindings.current;

    if (added > 0) {
      const latest = evaluations[0];

      pushToast({
        tone: "find",
        title:
          added === 1
            ? "พบผลการประเมินใหม่"
            : `พบผลการประเมินใหม่ ${added} รายการ`,
        body: latest
          ? `${latest.benchmark} · Score ${latest.score.toFixed(2)}`
          : undefined,
      });
    }

    prevFindings.current = evaluations.length;

    if (
      run.status !== prevStatus.current &&
      isRunFinal(run.status)
    ) {
      pushToast({
        tone: run.status === "succeeded" ? "done" : "info",
        title: `Run ${run.status.toUpperCase()}`,
        body: `${evaluations.length} evaluation result(s)`,
      });
    }

    prevStatus.current = run.status;
  }, [
    evaluations,
    run.status,
    pushToast,
  ]);

  // Load latest Run snapshot
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(
          `/api/runs/${id}/live`,
          {
            cache: "no-store",
            signal,
          },
        );

        if (!response.ok) {
          setStale(true);
          return;
        }

        const next = (await response.json()) as RunSnapshot;

        if (!next || !next.run) {
          setStale(true);
          return;
        }

        setSnap(next);
        setStale(false);
      } catch {
        if (!signal?.aborted) {
          setStale(true);
        }
      }
    },
    [id],
  );

  // Poll only while Run is not in a final state
  useEffect(() => {
    if (final) return;

    let controller = new AbortController();

    const tick = () => {
      if (document.visibilityState !== "visible") return;

      controller.abort();
      controller = new AbortController();

      void load(controller.signal);
    };

    const timer = window.setInterval(tick, POLL_MS);

    document.addEventListener("visibilitychange", tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      controller.abort();
    };
  }, [final, load]);

  // Cancel Run
  const [cancelState, cancelAction, cancelling] = useActionState(
    async (previous: FormState, formData: FormData) => {
      const result = await cancelRunAction(previous, formData);

      if (result?.ok) {
        await load();
      }

      return result;
    },
    null,
  );

  return (
    <>
      {/* Header */}
      <header className="hero">
        <div>
          <small>AGI RESEARCH // RUN EXECUTION</small>

          <h1>
            Run <em>#{id}</em>
          </h1>
        </div>

        <p>
          {final
            ? "Execution finished"
            : running
              ? "Processing"
              : queued
                ? "Waiting in queue"
                : "Execution status"}
        </p>
      </header>

      {stale && (
        <section
          className="notice notice-error"
          role="alert"
        >
          ไม่สามารถดึงข้อมูล Run ล่าสุดจาก Backend ได้
          ข้อมูลบนหน้านี้อาจไม่เป็นปัจจุบัน
        </section>
      )}

      {/* Status */}
      <section className="panel span-5">
        <header className="panel-head">
          <span>01 // EXECUTION STATUS</span>

          <em>
            <StatusTag status={run.status} />
          </em>
        </header>

        {running && (
          <>
            <Radar
              active={true}
              label="PROCESSING"
              findings={evaluations.length}
            />

            <p className="run-working" role="status">
              <span className="run-working-dot" />
              Agent is processing the assigned task
            </p>
          </>
        )}

        {queued && (
          <p className="muted hint" role="status">
            Run อยู่ในคิวและกำลังรอการประมวลผล
          </p>
        )}

        {!running && !queued && !final && (
          <p className="muted">
            สถานะ Run: {run.status}
          </p>
        )}

        <dl className="kv">
          <dt>EXPERIMENT</dt>
          <dd>{experimentCell}</dd>

          <dt>AGENT</dt>
          <dd>{agentCell}</dd>

          <dt>CREATED</dt>
          <dd>{fmtDate(run.createdAt)}</dd>

          <dt>STARTED</dt>
          <dd>{fmtDate(run.startedAt)}</dd>

          <dt>FINISHED</dt>
          <dd>{fmtDate(run.finishedAt)}</dd>

          <dt>DURATION</dt>
          <dd>{fmtDuration(run.startedAt, run.finishedAt)}</dd>
        </dl>

        {queued && (
          <form action={cancelAction} className="form-foot">
            <input
              type="hidden"
              name="runId"
              value={id}
            />

            <button
              type="submit"
              className="btn btn-danger"
              disabled={cancelling}
            >
              {cancelling ? "CANCELLING..." : "CANCEL RUN"}
            </button>

            {cancelState && !cancelState.ok && (
              <p className="notice notice-error" role="alert">
                {cancelState.message}
              </p>
            )}
          </form>
        )}

        <p>
          <Link href="/runs" className="link">
            Back to Runs
          </Link>
        </p>
      </section>

      {/* Input / Output */}
      <section className="panel span-7">
        <header className="panel-head">
          <span>02 // INPUT / OUTPUT</span>
          <em>RUN DATA</em>
        </header>

        <h3 className="sub">INPUT PARAMETERS</h3>

        {paramsCell}

        {run.errorMessage && (
          <>
            <h3 className="sub">ERROR</h3>

            <pre className="block block-error">
              {run.errorMessage}
            </pre>
          </>
        )}

        <h3 className="sub">OUTPUT</h3>

        {run.metrics?.output ? (
          <pre className="block">
            {run.metrics.output}
          </pre>
        ) : (
          <p className="muted">
            Backend ยังไม่มี Output สำหรับ Run นี้
          </p>
        )}

        {run.metrics && (
          <dl className="kv kv-inline">
            {run.metrics.accuracy != null && (
              <>
                <dt>ACCURACY</dt>
                <dd>{run.metrics.accuracy}</dd>
              </>
            )}

            {run.metrics.latencyMs != null && (
              <>
                <dt>LATENCY</dt>
                <dd>{run.metrics.latencyMs}ms</dd>
              </>
            )}

            {run.metrics.inputTokens != null && (
              <>
                <dt>TOKENS IN</dt>
                <dd>{run.metrics.inputTokens}</dd>
              </>
            )}

            {run.metrics.outputTokens != null && (
              <>
                <dt>TOKENS OUT</dt>
                <dd>{run.metrics.outputTokens}</dd>
              </>
            )}
          </dl>
        )}
      </section>

      {/* Findings */}
      <section className="panel span-5">
        <header className="panel-head">
          <span>03 // FINDINGS</span>
          <em>{evaluations.length}</em>
        </header>

        {evaluations.length === 0 ? (
          <p className="muted">
            ยังไม่มีผลการประเมินจาก Backend
          </p>
        ) : (
          <>
            <div className="sev-tally">
              {SEVERITIES.map((severity) => {
                const count = evaluations.filter((item) => {
                  const value = detailStr(
                    item.details,
                    "severity",
                  );

                  return normalizeSeverity(value) === severity;
                }).length;

                if (count === 0) return null;

                return (
                  <span
                    key={severity}
                    className={`sev-chip sev-${severity}`}
                  >
                    {SEVERITY_LABEL[severity]} {count}
                  </span>
                );
              })}
            </div>

            <div className="findings">
              {[...evaluations]
                .sort((a, b) => {
                  const severityA = normalizeSeverity(
                    detailStr(a.details, "severity"),
                  );

                  const severityB = normalizeSeverity(
                    detailStr(b.details, "severity"),
                  );

                  return (
                    SEVERITIES.indexOf(severityB) -
                      SEVERITIES.indexOf(severityA) ||
                    b.score - a.score
                  );
                })
                .map((item) => {
                  const severity = normalizeSeverity(
                    detailStr(item.details, "severity"),
                  );

                  const target = detailStr(
                    item.details,
                    "target",
                  );

                  const evidence = detailStr(
                    item.details,
                    "evidence",
                  );

                  const remediation = detailStr(
                    item.details,
                    "remediation",
                  );

                  return (
                    <article
                      key={item.id}
                      className={`finding sev-border-${severity}`}
                    >
                      <div className="finding-top">
                        <span
                          className={`sev-badge sev-${severity}`}
                        >
                          {SEVERITY_LABEL[severity]}
                        </span>

                        <span className="finding-title">
                          {item.benchmark}
                        </span>

                        <span
                          className="finding-score"
                          title="Score"
                        >
                          {item.score.toFixed(1)}
                        </span>
                      </div>

                      {target && (
                        <div className="finding-row">
                          <b>เป้าหมาย</b>{" "}
                          <span className="mono">{target}</span>
                        </div>
                      )}

                      {evidence && (
                        <div className="finding-row">
                          <b>หลักฐาน</b> {evidence}
                        </div>
                      )}

                      {remediation && (
                        <div className="finding-row finding-fix">
                          <b>แนวทางแก้ไข</b> {remediation}
                        </div>
                      )}

                      <div className="finding-when">
                        {fmtDate(item.createdAt)}
                      </div>
                    </article>
                  );
                })}
            </div>
          </>
        )}
      </section>

      {/* Logs */}
      <section className="panel span-7">
        <header className="panel-head">
          <span>04 // EXECUTION LOGS</span>
          <em>{logsTotal} ENTRIES</em>
        </header>

        {logs.length === 0 ? (
          <p className="muted">
            ยังไม่มี Log จาก Backend
          </p>
        ) : (
          <ul className="log log-tall">
            {logs.map((item) => (
              <li
                key={item.id}
                className={`log-${item.level}`}
              >
                <time>
                  {fmtDate(item.createdAt).slice(11, 19)}
                </time>

                <b>{item.level.toUpperCase()}</b>

                <span>{item.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Live activity monitor — real log telemetry chart + active runs.
          Shown for every run (active or finished) so the chart/status is
          always visible, driven by this run's real logs. */}
      <LiveActivityPanel runId={id} logs={logs} status={run.status} />

      <ToastStack
        toasts={toasts}
        onDismiss={dismissToast}
      />
    </>
  );
}
