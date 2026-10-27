"use client";

import Link from "next/link";
import { type ReactNode, useActionState, useCallback, useEffect, useRef, useState } from "react";
import { StatusTag } from "@/components/hud/StatusTag";
import { Radar } from "@/components/hud/Radar";
import { FlowPanel } from "@/components/hud/FlowPanel";
import { ToastStack, type ToastItem } from "@/components/hud/Toast";
import { buildPipeline } from "@/lib/pipeline";
import { fmtDate, fmtDuration } from "@/lib/format";
import { isRunFinal, type FormState, type RunSnapshot } from "@/lib/types";
import { cancelRunAction } from "../actions";

const POLL_MS = 4000;

// Finding severity (from the engine's report_finding: critical→info).
const SEV = ["info", "low", "medium", "high", "critical"] as const;
const sevRank = (s: string) => Math.max(0, SEV.indexOf((s || "info").toLowerCase() as (typeof SEV)[number]));
const SEV_LABEL: Record<string, string> = { critical: "วิกฤต", high: "สูง", medium: "กลาง", low: "ต่ำ", info: "ข้อมูล" };
function detailStr(d: unknown, k: string): string {
  if (!d || typeof d !== "object") return "";
  const v = (d as Record<string, unknown>)[k];
  return v == null ? "" : String(v);
}

/**
 * Cosmetic cells (experiment/agent name, prompt, params) are passed in as
 * already-rendered slots. They are async server components streamed via
 * Suspense from the page, so the live panels below render from the snapshot
 * immediately and these fill in a moment later without blocking first paint.
 */
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
  const id = run.id;

  const pipeline = buildPipeline(logs, run.status, evaluations.length);
  const modelLabel = `#${run.experimentId}`;

  // Toasts: pop one per new finding, and one when the run reaches a final state.
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);
  const prevFindings = useRef(evaluations.length);
  const prevStatus = useRef(run.status);
  const pushToast = useCallback((t: Omit<ToastItem, "id">) => {
    setToasts((cur) => [...cur, { ...t, id: ++toastSeq.current }].slice(-4));
  }, []);
  const dismissToast = useCallback((tid: number) => setToasts((cur) => cur.filter((t) => t.id !== tid)), []);

  useEffect(() => {
    const added = evaluations.length - prevFindings.current;
    if (added > 0) {
      const latest = evaluations[0];
      pushToast({
        tone: "find",
        title: added === 1 ? "New result found" : `${added} new results`,
        body: latest ? `${latest.benchmark} · score ${latest.score.toFixed(2)}` : undefined,
      });
    }
    prevFindings.current = evaluations.length;

    if (run.status !== prevStatus.current && isRunFinal(run.status)) {
      pushToast({
        tone: run.status === "succeeded" ? "done" : "info",
        title: `Run ${run.status}`,
        body: `${evaluations.length} result${evaluations.length === 1 ? "" : "s"} · ${fmtDuration(run.startedAt, run.finishedAt)}`,
      });
    }
    prevStatus.current = run.status;
  }, [evaluations, run.status, run.startedAt, run.finishedAt, pushToast]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await fetch(`/api/runs/${id}/live`, { cache: "no-store", signal });
        if (!res.ok) return setStale(true);
        setSnap((await res.json()) as RunSnapshot);
        setStale(false);
      } catch {
        if (!signal?.aborted) setStale(true);
      }
    },
    [id],
  );

  useEffect(() => {
    if (final) return;
    let ctl = new AbortController();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      ctl.abort();
      ctl = new AbortController();
      void load(ctl.signal);
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      ctl.abort();
    };
  }, [final, load]);

  const [cancelState, cancelAction, cancelling] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await cancelRunAction(prev, fd);
    if (res?.ok) await load();
    return res;
  }, null);

  return (
    <>
      <header className="hero">
        <div>
          <small>AGI RESEARCH // RUN</small>
          <h1>Run <em>#{id}</em></h1>
        </div>
        <p>
          {final ? "finished" : stale ? "connection lost · retrying" : "auto-refresh · 4s"}
        </p>
      </header>

      <section className="panel span-5">
        <header className="panel-head"><span>01 // STATUS</span><em><StatusTag status={run.status} /></em></header>
        {!final && (
          <>
            <Radar
              active={run.status === "running"}
              label={run.status === "running" ? "SCANNING" : "STANDBY"}
              findings={evaluations.length}
            />
            {run.status === "running" && (
              <p className="run-working" role="status">
                <span className="run-working-dot" />
                MODEL ACTIVE · {modelLabel} is working
                <span className="run-working-ellipsis"><i>.</i><i>.</i><i>.</i></span>
              </p>
            )}
          </>
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
        {run.status === "queued" && (
          <form action={cancelAction} className="form-foot">
            <input type="hidden" name="runId" value={id} />
            <button type="submit" className="btn btn-danger" disabled={cancelling}>
              {cancelling ? "CANCELLING..." : "CANCEL RUN"}
            </button>
            {cancelState && !cancelState.ok && <p className="notice notice-error" role="alert">{cancelState.message}</p>}
          </form>
        )}
        {run.status === "queued" && <p className="muted hint">waiting in queue — the runner has not picked this up yet</p>}
        <p><Link href="/runs" className="link">back to runs</Link></p>
      </section>

      <section className="panel span-7">
        <header className="panel-head"><span>02 // INPUT / OUTPUT</span><em>PARAMS · METRICS</em></header>
        {paramsCell}
        {run.errorMessage && (
          <>
            <h3 className="sub">ERROR</h3>
            <pre className="block block-error">{run.errorMessage}</pre>
          </>
        )}
        <h3 className="sub">OUTPUT</h3>
        {run.metrics?.output ? <pre className="block">{run.metrics.output}</pre> : <p className="muted">no output yet</p>}
        {run.metrics && (
          <dl className="kv kv-inline">
            {run.metrics.accuracy != null && <><dt>ACCURACY</dt><dd>{run.metrics.accuracy}</dd></>}
            {run.metrics.latencyMs != null && <><dt>LATENCY</dt><dd>{run.metrics.latencyMs}ms</dd></>}
            {run.metrics.inputTokens != null && <><dt>TOKENS IN</dt><dd>{run.metrics.inputTokens}</dd></>}
            {run.metrics.outputTokens != null && <><dt>TOKENS OUT</dt><dd>{run.metrics.outputTokens}</dd></>}
          </dl>
        )}
      </section>

      <section className="panel span-5">
        <header className="panel-head">
          <span>03 // FINDINGS (รายงาน)</span>
          <em>{evaluations.length}</em>
        </header>
        {evaluations.length === 0 ? (
          <p className="muted">ยังไม่มี findings</p>
        ) : (
          <>
            <div className="sev-tally">
              {(["critical", "high", "medium", "low", "info"] as const).map((s) => {
                const n = evaluations.filter((e) => detailStr(e.details, "severity").toLowerCase() === s || (!detailStr(e.details, "severity") && s === "info")).length;
                return n > 0 ? <span key={s} className={`sev-chip sev-${s}`}>{SEV_LABEL[s]} {n}</span> : null;
              })}
            </div>
            <div className="findings">
              {[...evaluations]
                .sort((a, b) => sevRank(detailStr(b.details, "severity")) - sevRank(detailStr(a.details, "severity")) || b.score - a.score)
                .map((e) => {
                  const sev = (detailStr(e.details, "severity") || "info").toLowerCase();
                  const target = detailStr(e.details, "target");
                  const evidence = detailStr(e.details, "evidence");
                  const remediation = detailStr(e.details, "remediation");
                  return (
                    <article key={e.id} className={`finding sev-border-${sev}`}>
                      <div className="finding-top">
                        <span className={`sev-badge sev-${sev}`}>{SEV_LABEL[sev] ?? sev}</span>
                        <span className="finding-title">{e.benchmark}</span>
                        <span className="finding-score" title="score">{e.score.toFixed(1)}</span>
                      </div>
                      {target && <div className="finding-row"><b>เป้าหมาย</b> <span className="mono">{target}</span></div>}
                      {evidence && <div className="finding-row"><b>หลักฐาน</b> {evidence}</div>}
                      {remediation && <div className="finding-row finding-fix"><b>วิธีแก้</b> {remediation}</div>}
                      <div className="finding-when">{fmtDate(e.createdAt)}</div>
                    </article>
                  );
                })}
            </div>
          </>
        )}
      </section>

      <section className="panel span-7">
        <header className="panel-head"><span>04 // LOG</span><em>{logsTotal} ENTRIES</em></header>
        {logs.length === 0 ? (
          <p className="muted">log is empty</p>
        ) : (
          <ul className="log log-tall">
            {logs.map((l) => (
              <li key={l.id} className={`log-${l.level}`}>
                <time>{fmtDate(l.createdAt).slice(11, 19)}</time>
                <b>{l.level.toUpperCase()}</b>
                <span>{l.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!final && <FlowPanel pipeline={pipeline} running={run.status === "running"} modelLabel={modelLabel} />}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
