"use client";

// TraderChart — a live, trader-style time-series drawn as inline SVG (no chart
// library). One series per chart: a thin glowing line over a vertical gradient
// area, a recessive horizontal grid, a dashed "last value" guide, a pulsing
// head dot, and a crosshair + tooltip on hover. Width is measured so marks and
// text are never stretched; height is fixed by the caller.
//
// Design (dataviz method): single series → no legend, the title names it;
// crosshair+tooltip is shipped by default on a line/area; grid/axes are
// recessive; color follows the entity, with an up/down tint for trend.

import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type TraderPoint = { t: number; v: number };

type Props = {
  points: TraderPoint[];
  label: string;
  color?: string;
  unit?: string;
  height?: number;
  /** Tint the line green/red by last delta instead of a fixed color. */
  trendTint?: boolean;
  format?: (v: number) => string;
};

const UP = "#3ad29f";
const DOWN = "#f87171";
const GRID = "rgba(150, 170, 200, 0.08)";
const INK = "#9aa4b2";
const PAD_T = 12;
const PAD_B = 16;
const PAD_R = 44; // room for the value axis label

function niceNum(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export const TraderChart = memo(function TraderChart({
  points,
  label,
  color = "#2de2e6",
  unit = "",
  height = 160,
  trendTint = false,
  format = niceNum,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId();

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw && cw > 0) setW(Math.round(cw));
    });
    ro.observe(el);
    setW(Math.round(el.clientWidth || 600));
    return () => ro.disconnect();
  }, []);

  const trend = useMemo(() => {
    if (points.length < 2) return 0;
    return points[points.length - 1].v - points[points.length - 2].v;
  }, [points]);

  const lineColor = trendTint ? (trend < 0 ? DOWN : UP) : color;

  const geo = useMemo(() => {
    const innerW = Math.max(10, w - PAD_R);
    const innerH = Math.max(10, height - PAD_T - PAD_B);
    const n = points.length;
    if (n === 0) {
      return { innerW, innerH, xs: [] as number[], ys: [] as number[], min: 0, max: 1 };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const p of points) {
      if (p.v < min) min = p.v;
      if (p.v > max) max = p.v;
    }
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const span = max - min;
    const xs = points.map((_, i) => (n === 1 ? innerW : (i / (n - 1)) * innerW));
    const ys = points.map((p) => PAD_T + innerH - ((p.v - min) / span) * innerH);
    return { innerW, innerH, xs, ys, min, max };
  }, [points, w, height]);

  const linePath = useMemo(() => {
    const { xs, ys } = geo;
    if (xs.length === 0) return "";
    let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
    for (let i = 1; i < xs.length; i++) {
      // Smooth-ish: midpoint control keeps it readable without overshoot.
      const cx = (xs[i - 1] + xs[i]) / 2;
      d += ` C ${cx.toFixed(1)} ${ys[i - 1].toFixed(1)}, ${cx.toFixed(1)} ${ys[i].toFixed(1)}, ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`;
    }
    return d;
  }, [geo]);

  const areaPath = useMemo(() => {
    if (!linePath) return "";
    const { xs, innerH } = geo;
    const base = PAD_T + innerH;
    return `${linePath} L ${xs[xs.length - 1].toFixed(1)} ${base} L ${xs[0].toFixed(1)} ${base} Z`;
  }, [linePath, geo]);

  const onMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const { xs } = geo;
      if (xs.length === 0) return;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < xs.length; i++) {
        const d = Math.abs(xs[i] - x);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      setHover(best);
    },
    [geo],
  );

  const last = points.length ? points[points.length - 1] : null;
  const hi = hover != null && points[hover] ? points[hover] : null;
  const hx = hover != null && geo.xs[hover] != null ? geo.xs[hover] : null;
  const hy = hover != null && geo.ys[hover] != null ? geo.ys[hover] : null;

  return (
    <div className="tc-wrap" ref={wrapRef}>
      <svg
        className="tc-svg"
        width={w}
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        role="img"
        aria-label={`${label}: ${last ? format(last.v) : "no data"}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`tc-fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.34" />
            <stop offset="60%" stopColor={lineColor} stopOpacity="0.08" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
          <filter id={`tc-glow-${uid}`} x="-20%" y="-40%" width="140%" height="180%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={lineColor} floodOpacity="0.55" />
          </filter>
        </defs>

        {/* recessive horizontal grid + value ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = PAD_T + geo.innerH * f;
          const val = geo.max - (geo.max - geo.min) * f;
          return (
            <g key={f}>
              <line x1="0" y1={y} x2={geo.innerW} y2={y} stroke={GRID} strokeWidth="1" />
              <text x={w - PAD_R + 6} y={y + 3} className="tc-axis" fill={INK}>
                {format(val)}
              </text>
            </g>
          );
        })}

        {points.length > 0 && (
          <>
            <path d={areaPath} fill={`url(#tc-fill-${uid})`} />
            <path
              d={linePath}
              fill="none"
              stroke={lineColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#tc-glow-${uid})`}
            />

            {/* last-value dashed guide + axis chip */}
            {last && (
              <>
                <line
                  x1="0"
                  y1={geo.ys[geo.ys.length - 1]}
                  x2={geo.innerW}
                  y2={geo.ys[geo.ys.length - 1]}
                  stroke={lineColor}
                  strokeWidth="1"
                  strokeDasharray="3 4"
                  opacity="0.5"
                />
                <circle
                  cx={geo.xs[geo.xs.length - 1]}
                  cy={geo.ys[geo.ys.length - 1]}
                  r="3.5"
                  fill={lineColor}
                  className="tc-head"
                />
              </>
            )}
          </>
        )}

        {/* crosshair + tooltip */}
        {hi && hx != null && hy != null && (
          <>
            <line x1={hx} y1={PAD_T} x2={hx} y2={PAD_T + geo.innerH} stroke={lineColor} strokeWidth="1" opacity="0.4" />
            <circle cx={hx} cy={hy} r="4" fill={lineColor} stroke="#06070b" strokeWidth="2" />
            <g transform={`translate(${Math.min(hx + 8, geo.innerW - 70)}, ${Math.max(PAD_T + 4, hy - 26)})`}>
              <rect width="74" height="30" rx="5" className="tc-tip-bg" />
              <text x="7" y="13" className="tc-tip-v" fill={lineColor}>
                {format(hi.v)}{unit}
              </text>
              <text x="7" y="25" className="tc-tip-t" fill={INK}>
                {new Date(hi.t).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </text>
            </g>
          </>
        )}
      </svg>

      {points.length === 0 && <span className="tc-empty">— รอข้อมูลสด —</span>}
    </div>
  );
});

// Local useId shim avoids importing from react for older type targets.
function useId(): string {
  const ref = useRef<string>("");
  if (!ref.current) ref.current = Math.random().toString(36).slice(2, 9);
  return ref.current;
}

export default TraderChart;
