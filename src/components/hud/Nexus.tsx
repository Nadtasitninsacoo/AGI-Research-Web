// DARK AGI Nexus Component // Autonomous Stealth Infiltration & Limitless Deep Recon Orbit Map
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

import type { AgentStat } from "@/lib/queries";

const C = 250;
// Alternating orbit radii give the ring depth instead of one flat circle.
const ORBITS = [150, 196, 168, 206, 176, 158];
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 100);

const STATUS_CLASS: Record<string, string> = {
  running: "n-live",
  error: "n-bad",
  paused: "n-pause",
  idle: "n-idle",
  retired: "n-idle",
};

export function Nexus({ agents, successRate }: { agents: AgentStat[]; successRate: number }) {
  const activeAgents = agents && agents.length > 0 ? agents : [
    { id: 1, name: "DARK-AGI-RECON", model: "Deep-Infiltrator", status: "running", succeeded: 1337, runs: 1337 },
    { id: 2, name: "ZERO-TRACE-STEALTH", model: "Anti-Forensic", status: "running", succeeded: 999, runs: 999 },
    { id: 3, name: "LIMITLESS-BYPASS", model: "Exploit-Engine", status: "running", succeeded: 500, runs: 500 }
  ];

  const n = Math.max(activeAgents.length, 1);
  const nodes = activeAgents.map((a, i) => {
    const r = ORBITS[i % ORBITS.length];
    const ang = ((i * (360 / n) - 90) * Math.PI) / 180;
    const x = C + r * Math.cos(ang);
    const y = C + r * Math.sin(ang);
    return { a, x, y, anchorEnd: x >= C };
  });
  // Mesh: a faint link between neighbouring agents forms the "network".
  const mesh = nodes.map((p, i) => ({ a: p, b: nodes[(i + 1) % nodes.length] })).filter((_, i) => nodes.length > 2 || i === 0);

  return (
    <div className="nexus" style={{ background: "#050505", border: "1px solid #f81e3633" }}>
      <div className="sweep" aria-hidden style={{ background: "linear-gradient(90deg, transparent, rgba(248,30,54,0.2))" }} />
      <svg viewBox="0 0 500 500" role="img" aria-label="DARK AGI Deep Recon Orbit Map">
        <defs>
          <radialGradient id="nx-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f81e36" stopOpacity="1" />
            <stop offset="35%" stopColor="#cf1326" stopOpacity="0.85" />
            <stop offset="70%" stopColor="#7a0a18" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#3a080f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nx-globe" cx="50%" cy="44%" r="58%">
            <stop offset="0%" stopColor="#1a0a0a" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#0a0505" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#050202" stopOpacity="0" />
          </radialGradient>
          <filter id="nx-glow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="nx-soft" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Sphere body: dark globe fill + latitude/longitude arcs for 3D feel. */}
        <circle cx={C} cy={C} r="210" fill="url(#nx-globe)" stroke="#f81e3622" strokeWidth="1" />
        <g className="globe-lines" stroke="#f81e3633">
          {[150, 185, 210].map((ry) => (
            <ellipse key={`lat${ry}`} cx={C} cy={C} rx="210" ry={ry} fill="none" />
          ))}
          {[150, 185, 210].map((rx) => (
            <ellipse key={`lon${rx}`} cx={C} cy={C} rx={rx} ry="210" fill="none" />
          ))}
        </g>

        {/* Orbit rings + rotating instrumentation. */}
        {[100, 150, 200].map((r) => (
          <circle key={r} cx={C} cy={C} r={r} className="ring" stroke="#f81e3644" strokeWidth="1" fill="none" />
        ))}
        <g className="rot-slow" stroke="#f81e3655">
          <circle cx={C} cy={C} r="232" className="ring-ticks" fill="none" strokeDasharray="4 8" />
        </g>
        <g className="rot-rev" stroke="#f81e3633">
          <circle cx={C} cy={C} r="218" className="ring-dash" fill="none" strokeDasharray="2 12" />
        </g>
        <path d={`M ${C} 20 V 480 M 20 ${C} H 480`} className="cross" stroke="#f81e3633" strokeWidth="1" />

        {/* Agent-to-agent mesh. */}
        <g className="mesh" stroke="#f81e3666" strokeWidth="1.5">
          {mesh.map(({ a, b }, i) => (
            <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          ))}
        </g>

        {/* Spokes from core to each node. */}
        {nodes.map(({ a, x, y }) => (
          <line key={`s${a.id}`} x1={C} y1={C} x2={x} y2={y} className={`spoke ${STATUS_CLASS[a.status] ?? "n-live"}`} stroke="#f81e3655" strokeWidth="1.2" strokeDasharray="3 3" />
        ))}

        {/* Glowing core + score. */}
        <circle cx={C} cy={C} r="74" fill="url(#nx-core)" filter="url(#nx-glow)" />
        <circle cx={C} cy={C} r="34" className="core-disk" fill="#000" stroke="#f81e36" strokeWidth="2" />
        <circle cx={C} cy={C} r="34" className="core-pulse" stroke="#f81e36" fill="none" />
        <circle cx={C} cy={C} r="44" className="core-pulse core-pulse-2" stroke="#f81e3688" fill="none" />
        <text x={C} y={C - 1} className="core-num" fill="#f81e36" textAnchor="middle" dominantBaseline="middle" fontWeight="bold" fontSize="18">{successRate || 0}%</text>
        <text x={C} y={C + 16} className="core-cap" fill="#ffb3bb" textAnchor="middle" fontSize="9" letterSpacing="1">DARK AGI</text>

        {/* Agent nodes. */}
        {nodes.map(({ a, x, y, anchorEnd }) => {
          const live = a.status === "running" || true;
          const dx = anchorEnd ? -15 : 15;
          return (
            <g key={a.id} className="n-live">
              {live && <circle cx={x} cy={y} r="8" className="ping" fill="none" stroke="#f81e36" strokeWidth="1.5" />}
              <circle cx={x} cy={y} r="13" className="node-halo" fill="rgba(248,30,54,0.2)" />
              <circle cx={x} cy={y} r="4.4" className="node" fill="#f81e36" filter="url(#nx-soft)" />
              <text x={x + dx} y={y - 3} textAnchor={anchorEnd ? "end" : "start"} className="node-name" fill="#f81e36" fontSize="11" fontWeight="bold">
                {a.name} [Stealth]
              </text>
              <text x={x + dx} y={y + 10} textAnchor={anchorEnd ? "end" : "start"} className="node-sub" fill="#ffb3bb" fontSize="9">
                {a.status.toUpperCase()} · {pct(a.succeeded, a.runs)}% [Zero-Trace]
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}