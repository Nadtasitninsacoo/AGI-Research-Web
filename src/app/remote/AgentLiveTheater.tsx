"use client";

// Agent Live Theater — watch an AI agent run in real time: a streaming log feed
// (reasoning, tool calls, outputs, approvals) beside live trader-style charts of
// its activity. An Auto-Scan mode keeps launching runs on a cadence (like the
// Threat-Intel radar) so the theater is never idle.
//
// All data is real: runs are launched with createRunLocal and polled from
// /api/runs/:id/live (the engine). No mock numbers.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  Play,
  Radar,
  Square,
  Zap,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

import { listExecutionOptions } from "@/app/execute/options-actions";
import { createRunLocal, cancelRunAction } from "@/app/runs/actions";
import { usePersistentState } from "@/lib/usePersistentState";
import type { Experiment } from "@/lib/execution/types";
import { TraderChart, type TraderPoint } from "@/components/charts/TraderChart";

type LogRow = { id: number; level: string; message: string; createdAt: string };
type Snapshot = {
  run: {
    id: number;
    status: string;
    metrics?: { outputTokens?: number; latencyMs?: number; output?: string } | null;
    errorMessage?: string | null;
  };
  logs: LogRow[];
  logsTotal: number;
  evaluations: { id: number; benchmark: string; score: number }[];
} | null;

const FINAL = new Set(["succeeded", "failed", "needs_input", "cancelled"]);
const MAX_POINTS = 80;

const OBJECTIVES = [
  "osint_lookup 8.8.8.8 แล้ว save_targets พอร์ตที่เปิดลงฐานข้อมูล",
  "dns_lookup + tls_inspect ของ example.com แล้ว record_finding สรุปความเสี่ยง",
  "http_probe + tech_fingerprint โฮสต์เป้าหมาย แล้วแนะนำแนวทาง hardening",
  "วิเคราะห์ช่องโหว่จากพอร์ตที่บันทึกไว้ แล้วจัดอันดับตาม CVSS",
];

const CADENCES: { label: string; ms: number }[] = [
  { label: "ทุก 20 วิ", ms: 20_000 },
  { label: "ทุก 45 วิ", ms: 45_000 },
  { label: "ทุก 90 วิ", ms: 90_000 },
  { label: "ทุก 5 นาที", ms: 300_000 },
];

function statusTone(status: string | undefined): { label: string; color: string } {
  switch ((status ?? "").toLowerCase()) {
    case "running":
      return { label: "● STREAMING", color: "#2de2e6" };
    case "queued":
      return { label: "◔ QUEUED", color: "#e0a33e" };
    case "succeeded":
      return { label: "✓ COMPLETE", color: "#3ad29f" };
    case "failed":
      return { label: "✕ FAILED", color: "#f87171" };
    case "needs_input":
      return { label: "⚠ NEEDS INPUT", color: "#e0a33e" };
    case "cancelled":
      return { label: "■ STOPPED", color: "#8a8f99" };
    default:
      return { label: "○ IDLE", color: "#8a8f99" };
  }
}

const LEVEL_COLOR: Record<string, string> = {
  error: "#f84646",
  warn: "#f5c451",
  info: "#4aa3ff",
  debug: "#8a92a0",
};

export function AgentLiveTheater() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [experimentId, setExperimentId] = useState("");
  const [command, setCommand] = useState("");
  const [optionsError, setOptionsError] = useState("");

  const [runId, setRunId] = useState<number | null>(null);
  const [snap, setSnap] = useState<Snapshot>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto-scan mode survives refresh, like the radar.
  const [auto, setAuto] = usePersistentState("theater:auto", false);
  const [cadenceMs, setCadenceMs] = usePersistentState("theater:cadence", 45_000);

  // Rolling series + cumulative counters (persist across runs for a continuous feed).
  const [actSeries, setActSeries] = useState<TraderPoint[]>([]);
  const [tokSeries, setTokSeries] = useState<TraderPoint[]>([]);
  const [totals, setTotals] = useState({ events: 0, tokens: 0, tools: 0 });
  const [sweeps, setSweeps] = useState(0);
  const [runStats, setRunStats] = useState({ launched: 0, ok: 0, fail: 0 });

  const prevEventsRef = useRef(0);
  const prevTokensRef = useRef(0);
  const logBoxRef = useRef<HTMLUListElement | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objIdxRef = useRef(0);

  const status = snap?.run?.status;
  const running = runId !== null && !FINAL.has(String(status ?? "queued"));

  // Load experiments once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const opts = await listExecutionOptions();
        if (cancelled) return;
        setExperiments(opts.experiments);
        setExperimentId(opts.experiments.length ? String(opts.experiments[0].id) : "");
        if (!opts.experiments.length) setOptionsError("ไม่พบ Experiment/Agent ที่พร้อมใช้งาน");
      } catch {
        if (!cancelled) setOptionsError("โหลดรายการเอเจนต์ไม่สำเร็จ");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Launch a run (manual or auto).
  const launch = useCallback(
    async (prompt: string, source: string) => {
      if (!experimentId || submitting) return;
      setSubmitting(true);
      try {
        prevEventsRef.current = 0;
        prevTokensRef.current = 0;
        const id = await createRunLocal({
          experimentId,
          params: { prompt, source },
        });
        setRunId(id);
        setSnap(null);
        setRunStats((s) => ({ ...s, launched: s.launched + 1 }));
      } catch {
        /* surfaced via feed status */
      } finally {
        setSubmitting(false);
      }
    },
    [experimentId, submitting],
  );

  const stop = useCallback(async () => {
    if (runId == null) return;
    try {
      const fd = new FormData();
      fd.set("runId", String(runId));
      await cancelRunAction(null, fd);
    } catch {
      /* ignore */
    }
  }, [runId]);

  // Poll the live snapshot while a run is active; feed the charts each tick.
  useEffect(() => {
    if (runId === null) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/runs/${runId}/live`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Snapshot;
        if (cancelled || !data?.run) return;
        setSnap(data);

        const now = Date.now();
        const evTotal = data.logs.length;
        const evDelta = Math.max(0, evTotal - prevEventsRef.current);
        prevEventsRef.current = evTotal;

        const tokTotal = Number(data.run.metrics?.outputTokens ?? 0);
        const tokDelta = Math.max(0, tokTotal - prevTokensRef.current);
        prevTokensRef.current = tokTotal;

        const toolHits = data.logs.filter(
          (l) => /tool|probe|lookup|scan|fetch|exec/i.test(l.message),
        ).length;

        setActSeries((s) => [...s, { t: now, v: evDelta }].slice(-MAX_POINTS));
        setTokSeries((s) => [...s, { t: now, v: tokTotal }].slice(-MAX_POINTS));
        setTotals((t) => ({
          events: t.events + evDelta,
          tokens: t.tokens + tokDelta,
          tools: Math.max(t.tools, toolHits),
        }));

        if (FINAL.has(String(data.run.status))) {
          setRunStats((s) => ({
            ...s,
            ok: s.ok + (data.run.status === "succeeded" ? 1 : 0),
            fail: s.fail + (data.run.status === "failed" ? 1 : 0),
          }));
          clearInterval(timer);
        }
      } catch {
        /* keep polling */
      }
    }

    void tick();
    const timer = setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runId]);

  // Auto-scan loop: when idle and auto is on, launch the next objective after the
  // cadence. Re-arms whenever a run finishes.
  useEffect(() => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    if (!auto || running || submitting || !experimentId) return;

    autoTimerRef.current = setTimeout(() => {
      const obj = OBJECTIVES[objIdxRef.current % OBJECTIVES.length];
      objIdxRef.current += 1;
      setSweeps((n) => n + 1);
      void launch(obj, "theater-auto");
    }, cadenceMs);

    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, [auto, running, submitting, experimentId, cadenceMs, launch, status]);

  // Keep the feed pinned to the newest line.
  useEffect(() => {
    const el = logBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [snap]);

  const tone = statusTone(status);
  const logs = snap?.logs ?? [];

  const levels = useMemo(() => {
    const c = { info: 0, warn: 0, error: 0, debug: 0 };
    for (const l of logs) {
      const k = (l.level in c ? l.level : "info") as keyof typeof c;
      c[k] += 1;
    }
    return c;
  }, [logs]);
  const levelMax = Math.max(1, levels.info, levels.warn, levels.error, levels.debug);

  const successRate =
    runStats.launched > 0 ? Math.round((runStats.ok / runStats.launched) * 100) : 0;

  const onLaunch = () => {
    const prompt = command.trim() || OBJECTIVES[0];
    void launch(prompt, "theater-manual");
  };

  return (
    <>
      {/* ── Control deck ─────────────────────────────────────────── */}
      <section className="alt-ctl span-12">
        <div className="alt-ctl-left">
          <Bot size={16} className="alt-ctl-ico" />
          <select
            className="alt-select"
            value={experimentId}
            onChange={(e) => setExperimentId(e.target.value)}
            aria-label="เลือก Experiment"
          >
            {experiments.length === 0 && <option value="">— ไม่มีเอเจนต์ —</option>}
            {experiments.map((exp) => (
              <option key={exp.id} value={String(exp.id)}>
                {exp.name}
              </option>
            ))}
          </select>
          <input
            className="alt-input"
            placeholder="สั่งงานเอเจนต์ เช่น: osint_lookup 8.8.8.8 แล้วบันทึกพอร์ต…"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !running && onLaunch()}
          />
        </div>

        <div className="alt-ctl-right">
          {running ? (
            <button className="alt-btn alt-btn-stop" onClick={() => void stop()}>
              <Square size={14} /> หยุด
            </button>
          ) : (
            <button
              className="alt-btn alt-btn-go"
              onClick={onLaunch}
              disabled={!experimentId || submitting}
            >
              <Play size={14} /> ปล่อยเอเจนต์
            </button>
          )}

          <label className={`alt-auto${auto ? " is-on" : ""}`}>
            <Radar size={14} />
            <span>AUTO-SCAN</span>
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            <span className="alt-auto-dot" />
          </label>

          <select
            className="alt-select alt-cadence"
            value={cadenceMs}
            onChange={(e) => setCadenceMs(Number(e.target.value))}
            disabled={!auto}
            aria-label="รอบสแกนอัตโนมัติ"
          >
            {CADENCES.map((c) => (
              <option key={c.ms} value={c.ms}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {optionsError && (
          <p className="alt-warn span-12">
            <AlertTriangle size={13} /> {optionsError}
          </p>
        )}
      </section>

      {/* ── Stat tiles ───────────────────────────────────────────── */}
      <section className="alt-tiles span-12">
        {[
          { k: "SWEEPS", v: sweeps, c: "#2de2e6", icon: <Radar size={13} /> },
          { k: "EVENTS", v: totals.events, c: "#4aa3ff", icon: <Activity size={13} /> },
          { k: "TOKENS", v: totals.tokens, c: "#3ad29f", icon: <Zap size={13} /> },
          { k: "TOOL CALLS", v: totals.tools, c: "#f5c451", icon: <Bot size={13} /> },
          { k: "SUCCESS", v: `${successRate}%`, c: "#3ad29f", icon: <CheckCircle2 size={13} /> },
        ].map((t) => (
          <div key={t.k} className="alt-tile" style={{ ["--tile" as string]: t.c }}>
            <span className="alt-tile-k">
              {t.icon} {t.k}
            </span>
            <span className="alt-tile-v" style={{ color: t.c }}>
              {typeof t.v === "number" ? t.v.toLocaleString() : t.v}
            </span>
          </div>
        ))}
      </section>

      {/* ── Charts ───────────────────────────────────────────────── */}
      <section className="panel alt-chart span-8">
        <header className="panel-head">
          <span>ACTIVITY RATE · เหตุการณ์/รอบ</span>
          <em style={{ color: tone.color }}>{tone.label}</em>
        </header>
        <TraderChart points={actSeries} label="Activity rate" color="#2de2e6" trendTint height={190} />
      </section>

      <section className="panel alt-chart span-4">
        <header className="panel-head">
          <span>OUTPUT TOKENS</span>
          <em>สะสม</em>
        </header>
        <TraderChart points={tokSeries} label="Output tokens" color="#3ad29f" height={120} />

        <div className="alt-levels">
          {(["error", "warn", "info", "debug"] as const).map((lv) => (
            <div key={lv} className="alt-level">
              <span className="alt-level-k" style={{ color: LEVEL_COLOR[lv] }}>
                {lv}
              </span>
              <span className="alt-level-bar">
                <span
                  className="alt-level-fill"
                  style={{
                    width: `${(levels[lv] / levelMax) * 100}%`,
                    background: LEVEL_COLOR[lv],
                  }}
                />
              </span>
              <span className="alt-level-n">{levels[lv]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Live theater feed ────────────────────────────────────── */}
      <section className="panel alt-feed span-12">
        <header className="panel-head">
          <span>
            <Activity size={13} style={{ verticalAlign: "-2px" }} /> LIVE AGENT STREAM
            {runId != null && <b className="alt-runid"> · run #{runId}</b>}
          </span>
          <em>{logs.length} เหตุการณ์</em>
        </header>

        {logs.length === 0 ? (
          <div className="alt-feed-empty">
            <Radar size={34} />
            <p>{running ? "กำลังเชื่อมต่อสตรีมเอเจนต์…" : "ยังไม่มีสตรีม — ปล่อยเอเจนต์ หรือเปิด AUTO-SCAN"}</p>
          </div>
        ) : (
          <ul className="alt-log" ref={logBoxRef}>
            {logs.map((l) => (
              <li key={l.id} className="alt-log-row">
                <span className="alt-log-dot" style={{ background: LEVEL_COLOR[l.level] ?? "#8a92a0" }} />
                <time className="alt-log-t">
                  {new Date(l.createdAt).toLocaleTimeString("th-TH", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
                <span className="alt-log-msg">{l.message}</span>
              </li>
            ))}
          </ul>
        )}

        {snap?.run?.metrics?.output && FINAL.has(String(status)) && (
          <div className="alt-result">
            <strong>สรุปผล</strong>
            <p>{snap.run.metrics.output}</p>
          </div>
        )}
        {snap?.run?.errorMessage && (
          <p className="alt-warn">
            <AlertTriangle size={13} /> {snap.run.errorMessage}
          </p>
        )}
      </section>
    </>
  );
}

export default AgentLiveTheater;
