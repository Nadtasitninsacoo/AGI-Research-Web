// Deterministic severity "signature" sparkline: a smooth area trend with a
// gradient fill, a crisp 2px line, and a glowing endpoint dot. The shape is
// stable per seed (never random each paint) and the colour is the severity's
// status colour. Decorative — not telemetry.
//
// Memoized: in long lists (e.g. 1000 rows) it must NOT regenerate its SVG on
// every parent re-render (selection toggles etc.) — only when seed/severity change.
// Perf: no CSS blur filters (they're expensive ×1000 rows); the "glow" is a
// second translucent dot, which stays cheap.

import { memo } from "react";

const SEV_HEX: Record<string, string> = {
  CRITICAL: "#ff4d57",
  HIGH: "#ff8a4c",
  MEDIUM: "#f5c451",
  LOW: "#4aa3ff",
  INFO: "#8a92a0",
};

const SEV_WEIGHT: Record<string, number> = {
  CRITICAL: 1,
  HIGH: 0.82,
  MEDIUM: 0.62,
  LOW: 0.45,
  INFO: 0.3,
};

export function severityHex(severity: string): string {
  return SEV_HEX[severity] ?? SEV_HEX.INFO;
}

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Catmull-Rom → cubic Bézier, so the trend reads as a smooth curve. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export const SeveritySparkline = memo(function SeveritySparkline({
  seed,
  severity,
  width = 72,
  height = 20,
  points = 16,
}: {
  seed: string;
  severity: string;
  width?: number;
  height?: number;
  points?: number;
}) {
  const color = severityHex(severity);
  const weight = SEV_WEIGHT[severity] ?? 0.4;
  const rnd = seededRandom(`${severity}:${seed}`);
  const uid = `spk-${severity}-${seed}`.replace(/[^a-zA-Z0-9_-]/g, "");

  // Build a stable, gently-drifting series inset 2px top/bottom.
  const padY = 2;
  const pts: [number, number][] = [];
  let y = 0.5;
  for (let i = 0; i < points; i++) {
    y += (rnd() - 0.5) * 0.3 * (0.5 + weight);
    y = Math.max(0.12, Math.min(0.88, y));
    const x = (i / (points - 1)) * width;
    const yy = padY + (1 - y) * (height - padY * 2);
    pts.push([Number(x.toFixed(1)), Number(yy.toFixed(1))]);
  }

  const line = smoothPath(pts);
  const area = `${line}L${width},${height}L0,${height}Z`;
  const [ex, ey] = pts[pts.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${severity} severity signature`}
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.38" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={area} fill={`url(#${uid}-fill)`} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* glow halo + crisp endpoint dot */}
      <circle cx={ex} cy={ey} r="3.2" fill={color} opacity="0.22" />
      <circle cx={ex} cy={ey} r="1.7" fill={color} />
    </svg>
  );
});
