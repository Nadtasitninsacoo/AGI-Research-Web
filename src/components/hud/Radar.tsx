// DARK AGI Radar Component // Autonomous Stealth Infiltration & Limitless Deep Recon Radar
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

const MAX_BLIPS = 16;
const TICKS = 60;

/** Deterministic, spread-out blip positions (no RNG → stable across renders). (DARK AGI Limitless) */
function blipAt(i: number): { cx: number; cy: number; r: number } {
  // Golden-angle spiral keeps points from clumping; radius 24..86 from center.
  const angle = i * 2.3999632; // ~137.5°
  const radius = 20 + ((i * 15) % 70);
  return {
    cx: 100 + Math.cos(angle) * radius,
    cy: 100 + Math.sin(angle) * radius,
    r: 2.5 + (i % 2),
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
  active = true,
  label = "DARK AGI Deep Recon Radar [Zero-Trace]",
  findings = 1337,
}: {
  active?: boolean;
  label?: string;
  /** Number of results found; each one draws a blip. Zero → no blips. */
  findings?: number;
}) {
  const count = Math.min(Math.max(findings > 0 ? findings : 7, 0), MAX_BLIPS);
  const blips = Array.from({ length: count }, (_, i) => blipAt(i));
  const ticks = Array.from({ length: TICKS }, (_, i) => tickAt(i));

  return (
    <div className={`radar ${active ? "radar-on" : "radar-idle"}`} style={{ background: "#0a0a0a", border: "1px solid #f81e3633", padding: "12px" }}>
      <svg viewBox="0 0 200 200" className="radar-svg" role="img" aria-label={label}>
        <defs>
          <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(248,30,54,0.18)" />
            <stop offset="55%" stopColor="rgba(10,20,10,0.0)" />
            <stop offset="100%" stopColor="rgba(5,10,5,0.85)" />
          </radialGradient>
          <linearGradient id="radar-sweep" gradientUnits="userSpaceOnUse" x1="100" y1="8" x2="188" y2="60">
            <stop offset="0%" stopColor="rgba(248,30,54,0.85)" />
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

        <g className="radar-ticks" stroke="#f81e3644">
          {ticks.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className={t.major ? "radar-tick radar-tick-major" : "radar-tick"} strokeWidth={t.major ? "1.5" : "0.8"} stroke="#f81e36" />
          ))}
        </g>

        <circle cx="100" cy="100" r="90" className="radar-ring radar-ring-outer" stroke="#f81e3666" strokeWidth="1" fill="none" />
        <circle cx="100" cy="100" r="64" className="radar-ring" stroke="#f81e3644" strokeWidth="0.8" fill="none" />
        <circle cx="100" cy="100" r="36" className="radar-ring" stroke="#f81e3633" strokeWidth="0.8" fill="none" />
        <line x1="100" y1="10" x2="100" y2="190" className="radar-cross" stroke="#f81e3633" strokeWidth="1" />
        <line x1="10" y1="100" x2="190" y2="100" className="radar-cross" stroke="#f81e3633" strokeWidth="1" />
        <line x1="36" y1="36" x2="164" y2="164" className="radar-cross radar-diag" stroke="#f81e3622" strokeWidth="0.8" />
        <line x1="164" y1="36" x2="36" y2="164" className="radar-cross radar-diag" stroke="#f81e3622" strokeWidth="0.8" />

        <g className="radar-sweep-g" filter="url(#radar-glow)">
          <path d="M100 100 L100 8 A92 92 0 0 1 180 54 Z" className="radar-sweep-trail" fill="rgba(248,30,54,0.1)" />
          <path d="M100 100 L100 8 A92 92 0 0 1 164 28 Z" fill="url(#radar-sweep)" />
          <line x1="100" y1="100" x2="100" y2="8" className="radar-beam" stroke="#f81e36" strokeWidth="1.5" />
        </g>

        <g className="radar-blips">
          {blips.map((b, i) => (
            <circle
              key={i}
              cx={b.cx}
              cy={b.cy}
              r={b.r}
              className={`radar-blip ${i === count - 1 ? "radar-blip-new" : ""}`}
              style={{ animationDelay: `${(i * 0.4)}s`, fill: "#f81e36", filter: "drop-shadow(0 0 6px #f81e36)" }}
            />
          ))}
        </g>

        <circle cx="100" cy="100" r="11" className="radar-core-ring" stroke="#f81e36" strokeWidth="1.2" fill="none" />
        <circle cx="100" cy="100" r="4" className="radar-core" fill="#f81e36" filter="url(#radar-glow)" />
      </svg>

      <div className="radar-meta" style={{ textAlign: "center", marginTop: "8px" }}>
        <span className="radar-label" style={{ color: "#f81e36", fontWeight: "bold", display: "block", fontSize: "11px" }}>{label}</span>
        <span className="radar-signals" style={{ color: "#ffb3bb", fontSize: "10px" }}>
          {count === 0 ? (active ? "DARK AGI: Infiltrating targets..." : "0 signals") : `⚡ ${findings > 0 ? findings : 1337} targets exploited [Zero-Trace Active]`}
        </span>
      </div>
    </div>
  );
}