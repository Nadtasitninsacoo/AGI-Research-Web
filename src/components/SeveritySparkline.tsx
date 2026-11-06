// Deterministic severity "signature" sparkline. The primary line is coloured
// and scaled by the real severity; the shape is stable per seed (never random
// noise that changes each paint). Decorative — not telemetry.
//
// Memoized: in long lists (e.g. 1000 rows) it must NOT regenerate its SVG on
// every parent re-render (selection toggles etc.) — only when seed/severity change.

import { memo } from "react";

const SEV_HEX: Record<string, string> = {
  CRITICAL: "#f84646",
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

export const SeveritySparkline = memo(function SeveritySparkline({
  seed,
  severity,
  width = 72,
  height = 20,
  points = 22,
  lines = 1,
}: {
  seed: string;
  severity: string;
  width?: number;
  height?: number;
  points?: number;
  lines?: 1 | 3;
}) {
  const weight = SEV_WEIGHT[severity] ?? 0.4;
  const rnd = seededRandom(`${severity}:${seed}`);

  const makeLine = (amp: number, drift: number) => {
    let y = 0.5;
    const pts: string[] = [];
    for (let i = 0; i < points; i++) {
      y += (rnd() - 0.5) * drift * (0.5 + weight);
      y = Math.max(0.1, Math.min(0.9, y));
      const x = (i / (points - 1)) * width;
      const yy = height / 2 + (0.5 - y) * height * amp;
      pts.push(`${x.toFixed(1)},${yy.toFixed(1)}`);
    }
    return pts.join(" ");
  };

  const series =
    lines === 3
      ? [
          { color: "#5fd38a", amp: 0.72, drift: 0.22, w: 1, o: 0.5 },
          { color: "#2de2e6", amp: 0.82, drift: 0.26, w: 1, o: 0.5 },
          { color: severityHex(severity), amp: 0.96, drift: 0.32, w: 1.6, o: 1 },
        ]
      : [{ color: severityHex(severity), amp: 0.9, drift: 0.3, w: 1.4, o: 1 }];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${severity} severity signature`}
      style={{ display: "block" }}
    >
      {series.map((s) => (
        <polyline
          key={s.color}
          points={makeLine(s.amp, s.drift)}
          fill="none"
          stroke={s.color}
          strokeWidth={s.w}
          strokeOpacity={s.o}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
});
