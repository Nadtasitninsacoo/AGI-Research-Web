/**
 * Animated radar sweep shown while a run is live (scanning).
 * Pure SVG + CSS (see src/styles/radar.css). Respects prefers-reduced-motion.
 *
 * Blips are NOT decorative: one red blip per finding. A run that has found
 * nothing shows an empty sweep. The newest finding blips brighter.
 */
const MAX_BLIPS = 12;
const TICKS = 60;

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

/** Outer tick marks around the dial; every 5th is a longer major tick. */
function tickAt(i: number): { x1: number; y1: number; x2: number; y2: number; major: boolean } {
  const a = (i / TICKS) * Math.PI * 2;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const major = i % 5 === 0;
  const len = major ? 7 : 3.5;
  return { x1: 100 + cos * 96, y1: 100 + sin * 96, x2: 100 + cos * (96 - len), y2: 100 + sin * (96 - len), major };
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
  const ticks = Array.from({ length: TICKS }, (_, i) => tickAt(i));

  return (
    <div className={`radar ${active ? "radar-on" : "radar-idle"}`}>
      <svg viewBox="0 0 200 200" className="radar-svg" role="img" aria-label={label}>
        <defs>
          <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(214,22,44,0.14)" />
            <stop offset="55%" stopColor="rgba(10,10,14,0.0)" />
            <stop offset="100%" stopColor="rgba(5,5,9,0.65)" />
          </radialGradient>
          <linearGradient id="radar-sweep" gradientUnits="userSpaceOnUse" x1="100" y1="8" x2="188" y2="60">
            <stop offset="0%" stopColor="rgba(248,30,54,0.75)" />
            <stop offset="100%" stopColor="rgba(248,30,54,0)" />
          </linearGradient>
          <filter id="radar-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx="100" cy="100" r="96" fill="url(#radar-bg)" />

        <g className="radar-ticks">
          {ticks.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className={t.major ? "radar-tick radar-tick-major" : "radar-tick"} />
          ))}
        </g>

        <circle cx="100" cy="100" r="90" className="radar-ring radar-ring-outer" />
        <circle cx="100" cy="100" r="64" className="radar-ring" />
        <circle cx="100" cy="100" r="36" className="radar-ring" />
        <line x1="100" y1="10" x2="100" y2="190" className="radar-cross" />
        <line x1="10" y1="100" x2="190" y2="100" className="radar-cross" />
        <line x1="36" y1="36" x2="164" y2="164" className="radar-cross radar-diag" />
        <line x1="164" y1="36" x2="36" y2="164" className="radar-cross radar-diag" />

        <g className="radar-sweep-g" filter="url(#radar-glow)">
          <path d="M100 100 L100 8 A92 92 0 0 1 180 54 Z" className="radar-sweep-trail" />
          <path d="M100 100 L100 8 A92 92 0 0 1 164 28 Z" fill="url(#radar-sweep)" />
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

        <circle cx="100" cy="100" r="11" className="radar-core-ring" />
        <circle cx="100" cy="100" r="4" className="radar-core" filter="url(#radar-glow)" />
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
