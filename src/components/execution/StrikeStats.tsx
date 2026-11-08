"use client";

// Live strike dashboard: a donut of outcomes, a scanning radar (spins while the
// job runs), and a click-through to each target's reason (success/failure),
// pulled from the real run result in the DB.

import { useState, useTransition } from "react";
import { s } from "./classNames";
import { Radar } from "@/components/hud/Radar";
import { countJob, phaseOf, type PipelineJob, type Phase } from "@/lib/execution/pipeline";
import { getRunResult, type RunResult } from "@/app/runs/actions";

const PHASE_META: Record<Phase, { label: string; color: string }> = {
  done: { label: "สำเร็จ", color: "#3ad29f" },
  failed: { label: "ล้มเหลว", color: "#ff4d57" },
  recon: { label: "กำลังสแกน", color: "#ffb84d" },
  final: { label: "ขั้นสุดท้าย", color: "#4aa3ff" },
  pending: { label: "รอคิว", color: "#6a6b77" },
};

const R = 52;
const C = 2 * Math.PI * R;

export function StrikeStats({ job }: { job: PipelineJob | null }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunResult | null>(null);
  const [loading, startLoad] = useTransition();
  const [filter, setFilter] = useState<Phase | null>(null);

  if (!job) return null;

  const c = countJob(job);
  const running = job.active;

  // Donut segments (order fixed so colour follows outcome, never rank).
  const segs = [
    { key: "done" as Phase, value: c.done },
    { key: "failed" as Phase, value: c.failed },
    { key: "active" as const, value: c.active, phase: null },
    { key: "pending" as Phase, value: c.pending },
  ];
  const activeColor = "#ffb84d";
  const total = Math.max(1, c.total);
  let acc = 0;

  const targets = job.targets
    .map((t) => ({ t, ph: phaseOf(t, job.withFinal) }))
    .filter(({ ph }) => {
      if (!filter) return true;
      if (filter === "recon" || filter === "final") return ph === "recon" || ph === "final";
      return ph === filter;
    });

  function openReason(key: string, runId: number | null) {
    setOpenKey((k) => (k === key ? null : key));
    setDetail(null);
    if (!runId) return;
    startLoad(async () => {
      try {
        setDetail(await getRunResult(runId));
      } catch {
        setDetail(null);
      }
    });
  }

  return (
    <div className={s.strikeDash}>
      <div className={s.strikeTop}>
        <div className={s.strikeRadar}>
          <Radar active={running} label={running ? "SCANNING" : "STANDBY"} findings={c.done} />
        </div>

        <div className={s.donutWrap}>
          <svg viewBox="0 0 140 140" className={s.donut} role="img" aria-label="outcome donut">
            <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
            {segs.map((seg) => {
              const color = seg.key === "active" ? activeColor : PHASE_META[seg.key as Phase].color;
              const len = (seg.value / total) * C;
              const el = (
                <circle
                  key={seg.key}
                  cx="70"
                  cy="70"
                  r={R}
                  fill="none"
                  stroke={color}
                  strokeWidth="14"
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={-acc}
                  transform="rotate(-90 70 70)"
                  strokeLinecap="butt"
                  opacity={seg.value === 0 ? 0 : 1}
                />
              );
              acc += len;
              return el;
            })}
            <text x="70" y="64" textAnchor="middle" className={s.donutBig}>{c.done}</text>
            <text x="70" y="82" textAnchor="middle" className={s.donutSub}>/ {c.total} สำเร็จ</text>
          </svg>
        </div>
      </div>

      {/* clickable legend = status filter */}
      <div className={s.strikeLegend}>
        {([
          ["done", c.done],
          ["failed", c.failed],
          ["recon", c.active],
          ["pending", c.pending],
        ] as [Phase, number][]).map(([ph, val]) => (
          <button
            key={ph}
            type="button"
            className={`${s.legendItem} ${filter === ph ? s.legendOn : ""}`}
            onClick={() => setFilter((f) => (f === ph ? null : ph))}
            title="คลิกเพื่อกรองรายการ"
          >
            <i style={{ background: ph === "recon" ? activeColor : PHASE_META[ph].color }} />
            {PHASE_META[ph].label} <b>{val}</b>
          </button>
        ))}
      </div>

      {/* target list — click a row to see the reason (from the real run result) */}
      <div className={s.strikeList}>
        {targets.map(({ t, ph }) => {
          const runId = t.finalRunId ?? t.reconRunId;
          const open = openKey === t.key;
          return (
            <div key={t.key} className={s.strikeRow} data-phase={ph}>
              <button type="button" className={s.strikeRowHead} onClick={() => openReason(t.key, runId)}>
                <i className={s.strikeDot} style={{ background: ph === "recon" || ph === "final" ? activeColor : PHASE_META[ph].color }} />
                <span className={s.strikeIp}>{t.ip}:{t.port}</span>
                <span className={s.strikePh} style={{ color: PHASE_META[ph].color }}>{PHASE_META[ph].label}</span>
                {runId && <span className={s.strikeRunId}>#{runId}</span>}
              </button>
              {open && (
                <div className={s.strikeReason}>
                  {loading ? (
                    <span className={s.strikeMuted}>กำลังโหลดเหตุผล...</span>
                  ) : !runId ? (
                    <span className={s.strikeMuted}>ยังไม่เริ่มรัน</span>
                  ) : detail ? (
                    <>
                      <p className={s.strikeOut}>{detail.output?.slice(0, 600) || "(ไม่มีสรุปผล)"}</p>
                      {detail.findings.length > 0 && (
                        <ul className={s.strikeFindings}>
                          {detail.findings.slice(0, 8).map((f, i) => (
                            <li key={i}>• {f.title} <em>(score {f.score})</em></li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <span className={s.strikeMuted}>ไม่พบผลลัพธ์</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
