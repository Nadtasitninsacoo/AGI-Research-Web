"use client";

import Link from "next/link";
import { Suspense, use, useActionState, useCallback, useEffect, useRef, useState } from "react";
import { StatusTag } from "@/components/hud/StatusTag";
import { Radar } from "@/components/hud/Radar";
import { FlowPanel } from "@/components/hud/FlowPanel";
import { ToastStack, type ToastItem } from "@/components/hud/Toast";
import { buildPipeline } from "@/lib/pipeline";
import { fmtDate, fmtDuration } from "@/lib/format";
import { isRunFinal, type FormState, type JsonObject, type RunSnapshot } from "@/lib/types";
import { cancelRunAction } from "../actions";

const POLL_MS = 4000;

type Info = { experimentName: string | null; agentName: string | null; params: JsonObject | null };

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v, null, 2));

/** Streamed cosmetic cells — they wait on the run-list lookup without blocking
 *  the live panels, which render from the snapshot immediately. */
function ExperimentName({ promise, fallbackId }: { promise: Promise<Info>; fallbackId: number }) {
  return <>{use(promise).experimentName ?? `#${fallbackId}`}</>;
}
function AgentName({ promise }: { promise: Promise<Info> }) {
  return <>{use(promise).agentName ?? "—"}</>;
}
function ParamsBlock({ promise }: { promise: Promise<Info> }) {
  const params = use(promise).params;
  const prompt = params && typeof params.prompt === "string" ? params.prompt : null;
  const otherParams = params ? Object.entries(params).filter(([k]) => k !== "prompt") : [];
  return (
    <>
      <h3 className="sub">PROMPT</h3>
      {prompt !== null ? <pre className="block">{prompt}</pre> : <p className="muted">no prompt recorded</p>}
      {otherParams.length > 0 && (
        <>
          <h3 className="sub">OTHER PARAMS</h3>
          <pre className="block">{show(Object.fromEntries(otherParams))}</pre>
        </>
      )}
    </>
  );
}

export function RunLive({ initial, infoPromise }: { initial: RunSnapshot; infoPromise: Promise<Info> }) {
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
          <dd><Suspense fallback={<span className="muted">…</span>}><ExperimentName promise={infoPromise} fallbackId={run.experimentId} /></Suspense></dd>
          <dt>AGENT</dt>
          <dd><Suspense fallback={<span className="muted">…</span>}><AgentName promise={infoPromise} /></Suspense></dd>
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
        <Suspense fallback={<p className="muted">loading params…</p>}>
          <ParamsBlock promise={infoPromise} />
        </Suspense>
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
        <header className="panel-head"><span>03 // EVALUATIONS</span><em>{evaluations.length}</em></header>
        {evaluations.length === 0 ? (
          <p className="muted">no evaluations yet</p>
        ) : (
          <div className="table-scroll">
            <table className="grid-table">
              <thead><tr><th>BENCHMARK</th><th className="num">SCORE</th><th>RECORDED</th></tr></thead>
              <tbody>
                {evaluations.map((e) => (
                  <tr key={e.id}>
                    <td className="strong">{e.benchmark}</td>
                    <td className="num">{e.score.toFixed(3)}</td>
                    <td className="muted">{fmtDate(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
