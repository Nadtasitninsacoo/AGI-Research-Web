"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listActiveRuns, type ActiveRunInfo } from "@/app/runs/actions";
import type { RunLog } from "@/lib/types";
import { fmtDate } from "@/lib/format";

const POLL_MS = 5000;
const BUCKETS = 48;

type Props = {
  runId: number;
  logs: RunLog[];
  status: string;
};

type StatusMeta = { label: string; accent: string };

function statusMeta(status: string): StatusMeta {
  switch (status.toLowerCase()) {
    case "running":
      return { label: "● STREAMING", accent: "#2de2e6" };
    case "queued":
      return { label: "QUEUED", accent: "#e0a33e" };
    case "succeeded":
      return { label: "✓ COMPLETED", accent: "#3ad29f" };
    case "failed":
      return { label: "✕ FAILED", accent: "#f81e36" };
    case "cancelled":
      return { label: "CANCELLED", accent: "#8a8f99" };
    default:
      return { label: status.toUpperCase(), accent: "#8a8f99" };
  }
}

/** Build an evenly-spaced activity series (log entries per time bucket). */
function buildSeries(logs: RunLog[]): { points: number[]; from: number; to: number } {
  const times = logs
    .map((l) => Date.parse(l.createdAt))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  if (times.length === 0) return { points: [], from: 0, to: 0 };

  const from = times[0];
  const to = times[times.length - 1];
  const span = Math.max(to - from, 1);
  const points = new Array<number>(BUCKETS).fill(0);

  for (const t of times) {
    const idx = Math.min(BUCKETS - 1, Math.floor(((t - from) / span) * BUCKETS));
    points[idx] += 1;
  }

  return { points, from, to };
}

/** Catmull-Rom → smooth SVG path for a series normalized to the viewBox. */
function smoothPath(values: number[], w: number, h: number, pad: number): string {
  const n = values.length;
  if (n === 0) return "";

  const max = Math.max(1, ...values);
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const x = (i: number) => pad + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad + innerH - (v / max) * innerH;

  const pts = values.map((v, i) => [x(i), y(v)] as const);
  if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;

  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function LiveActivityPanel({ runId, logs, status }: Props) {
  const [activeRuns, setActiveRuns] = useState<ActiveRunInfo[]>([]);
  const running = status.toLowerCase() === "running";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const runs = await listActiveRuns();
        if (!cancelled) setActiveRuns(runs);
      } catch {
        if (!cancelled) setActiveRuns([]);
      }
    }

    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runId]);

  const { points, from, to } = useMemo(() => buildSeries(logs), [logs]);

  const W = 600;
  const H = 170;
  const PAD = 10;

  const line = smoothPath(points, W, H, PAD);
  const area = line ? `${line} L ${W - PAD} ${H - PAD} L ${PAD} ${H - PAD} Z` : "";

  const max = points.length ? Math.max(1, ...points) : 0;
  const lastValue = points.length ? points[points.length - 1] : 0;
  const totalEntries = points.reduce((a, b) => a + b, 0);
  const errors = logs.filter((l) => l.level === "error").length;
  const warns = logs.filter((l) => l.level === "warn").length;

  const meta = statusMeta(status);
  const accent = meta.accent;

  return (
    <>
      {/* Live activity chart */}
      <section className="panel span-7">
        <header className="panel-head">
          <span>05 // LIVE ACTIVITY</span>
          <em style={{ color: accent }}>{meta.label}</em>
        </header>

        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          <Stat label="LOG ENTRIES" value={totalEntries} />
          <Stat label="PEAK / BUCKET" value={max} />
          <Stat label="ERRORS" value={errors} tone={errors > 0 ? "#f81e36" : undefined} />
          <Stat label="WARNINGS" value={warns} tone={warns > 0 ? "#e0a33e" : undefined} />
          <Stat label="NOW" value={lastValue} tone={accent} />
        </div>

        {points.length === 0 ? (
          <p className="muted" style={{ padding: "28px 0", textAlign: "center" }}>
            ยังไม่มีข้อมูลกิจกรรม — รอ log จากเอเจนต์
          </p>
        ) : (
          <div style={{ position: "relative" }}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              style={{ width: "100%", height: 180, display: "block" }}
              role="img"
              aria-label="Log activity over time"
            >
              <defs>
                <linearGradient id="actFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={accent} stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* grid */}
              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={f}
                  x1={PAD}
                  x2={W - PAD}
                  y1={PAD + (H - PAD * 2) * f}
                  y2={PAD + (H - PAD * 2) * f}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="1"
                />
              ))}

              {area && <path d={area} fill="url(#actFill)" />}
              {line && (
                <path
                  d={line}
                  fill="none"
                  stroke={accent}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {/* last point marker */}
              {points.length > 0 && (
                <circle
                  cx={W - PAD}
                  cy={
                    PAD +
                    (H - PAD * 2) -
                    (lastValue / Math.max(1, max)) * (H - PAD * 2)
                  }
                  r="3.5"
                  fill={accent}
                >
                  {running && (
                    <animate
                      attributeName="opacity"
                      values="1;0.3;1"
                      dur="1.2s"
                      repeatCount="indefinite"
                    />
                  )}
                </circle>
              )}
            </svg>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                color: "var(--dim, #8a8f99)",
                fontFamily: "var(--font-mono), monospace",
                marginTop: 4,
              }}
            >
              <span>{from ? fmtDate(new Date(from).toISOString()).slice(11, 19) : ""}</span>
              <span>{to ? fmtDate(new Date(to).toISOString()).slice(11, 19) : ""}</span>
            </div>
          </div>
        )}
      </section>

      {/* Active runs list */}
      <section className="panel span-5">
        <header className="panel-head">
          <span>06 // ACTIVE RUNS</span>
          <em style={{ color: activeRuns.length > 0 ? "#2de2e6" : undefined }}>
            {activeRuns.length} LIVE
          </em>
        </header>

        {activeRuns.length === 0 ? (
          <p className="muted" style={{ padding: "20px 0", textAlign: "center" }}>
            ไม่มี Run ที่กำลังทำงานอยู่ในขณะนี้
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {activeRuns.map((r) => {
              const isThis = r.id === runId;
              const isRunning = r.status === "running";
              const dot = isRunning ? "#2de2e6" : "#e0a33e";

              return (
                <li key={r.id}>
                  <Link
                    href={`/runs/${r.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${
                        isThis ? accent + "66" : "var(--line, rgba(255,255,255,0.08))"
                      }`,
                      background: isThis ? accent + "12" : "rgba(255,255,255,0.02)",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: dot,
                        boxShadow: isRunning ? `0 0 6px ${dot}` : "none",
                        flex: "none",
                      }}
                    />

                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          display: "block",
                          fontFamily: "var(--font-mono), monospace",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        Run #{r.id}
                        {isThis && (
                          <em
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              color: accent,
                              fontStyle: "normal",
                            }}
                          >
                            (หน้านี้)
                          </em>
                        )}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: 11,
                          color: "var(--dim, #8a8f99)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.experimentName ?? "—"}
                        {r.agentName ? ` · ${r.agentName}` : ""}
                      </span>
                    </span>

                    <span
                      style={{
                        flex: "none",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        color: dot,
                      }}
                    >
                      {isRunning ? "กำลังรัน" : "ในคิว"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          fontSize: 10,
          letterSpacing: 0.6,
          color: "var(--dim, #8a8f99)",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "var(--font-mono), monospace",
          color: tone ?? "var(--ink, #eaeaea)",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}
