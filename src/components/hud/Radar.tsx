/**
 * Animated radar sweep shown while a run is live (scanning).
 * Pure SVG + CSS (see src/styles/radar.css). Respects prefers-reduced-motion.
 *
 * Blips are NOT decorative: one red blip per finding. A run that has found
 * nothing shows an empty sweep. The newest finding blips brighter.
 */
const MAX_BLIPS = 12;

/** Deterministic, spread-out blip positions (no RNG → stable across renders). */
function blipAt(i: number): { cx: number; cy: number; r: number } {
  // Golden-angle spiral keeps points from clumping; radius 24..86 from center.
  const angle = i * 2.3999632; // ~137.5°
  const radius = 24 + ((i * 13) % 62);
  return {
    cx: 100 + Math.cos(angle) * radius,
    cy: 100 + Math.sin(angle) * radius,
    r: 2 + (i % 2),
  };
}

export function Radar({
  active,
  label,
  findings = 0,
}: {
  active: boolean;
  label: string;
  /** Number of results found; each one draws a blip. Zero → no blips. */
  findings?: number;
}) {
  const count = Math.min(Math.max(findings, 0), MAX_BLIPS);
  const blips = Array.from({ length: count }, (_, i) => blipAt(i));

  return (
    <div className={`radar ${active ? "radar-on" : "radar-idle"}`}>
      <svg viewBox="0 0 200 200" className="radar-svg" role="img" aria-label={label}>
        <defs>
          <linearGradient id="radar-sweep" gradientUnits="userSpaceOnUse" x1="100" y1="8" x2="186" y2="69">
            <stop offset="0%" stopColor="rgba(248,30,54,0.55)" />
            <stop offset="100%" stopColor="rgba(248,30,54,0)" />
          </linearGradient>
        </defs>

        <circle cx="100" cy="100" r="92" className="radar-ring" />
        <circle cx="100" cy="100" r="64" className="radar-ring" />
        <circle cx="100" cy="100" r="34" className="radar-ring" />
        <line x1="100" y1="8" x2="100" y2="192" className="radar-cross" />
        <line x1="8" y1="100" x2="192" y2="100" className="radar-cross" />

        <g className="radar-sweep-g">
          <path d="M100 100 L100 8 A92 92 0 0 1 186 69 Z" fill="url(#radar-sweep)" />
          <line x1="100" y1="100" x2="100" y2="8" className="radar-beam" />
        </g>

        <g className="radar-blips">
          {blips.map((b, i) => (
            <circle
              key={i}
              cx={b.cx}
              cy={b.cy}
              r={b.r}
              className={`radar-blip ${i === count - 1 ? "radar-blip-new" : ""}`}
              style={{ animationDelay: `${(i % 5) * 0.6}s` }}
            />
          ))}
        </g>

        <circle cx="100" cy="100" r="3" className="radar-core" />
      </svg>

      <div className="radar-meta">
        <span className="radar-label">{label}</span>
        <span className="radar-signals">
          {count === 0 ? (active ? "no signals yet" : "0 signals") : `${findings} signal${findings === 1 ? "" : "s"}`}
        </span>
      </div>
    </div>
  );
}
