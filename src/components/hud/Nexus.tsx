import type { AgentStat } from "@/lib/queries";

const C = 250;
// Alternating orbit radii give the ring depth instead of one flat circle.
const ORBITS = [150, 196, 168, 206, 176, 158];
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

const STATUS_CLASS: Record<string, string> = {
  running: "n-live",
  error: "n-bad",
  paused: "n-pause",
  idle: "n-idle",
  retired: "n-idle",
};

export function Nexus({ agents, successRate }: { agents: AgentStat[]; successRate: number }) {
  const n = Math.max(agents.length, 1);
  const nodes = agents.map((a, i) => {
    const r = ORBITS[i % ORBITS.length];
    const ang = ((i * (360 / n) - 90) * Math.PI) / 180;
    const x = C + r * Math.cos(ang);
    const y = C + r * Math.sin(ang);
    return { a, x, y, anchorEnd: x >= C };
  });
  // Mesh: a faint link between neighbouring agents forms the "network".
  const mesh = nodes.map((p, i) => ({ a: p, b: nodes[(i + 1) % nodes.length] })).filter((_, i) => nodes.length > 2 || i === 0);

  return (
    <div className="nexus">
      <div className="sweep" aria-hidden />
      <svg viewBox="0 0 500 500" role="img" aria-label="Agent orbit map">
        <defs>
          <radialGradient id="nx-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff5661" stopOpacity="1" />
            <stop offset="35%" stopColor="#ff2a36" stopOpacity="0.85" />
            <stop offset="70%" stopColor="#8b0a14" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#8b0a14" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nx-globe" cx="50%" cy="44%" r="58%">
            <stop offset="0%" stopColor="#1a1013" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#0c0c11" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#060609" stopOpacity="0" />
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
        <circle cx={C} cy={C} r="210" fill="url(#nx-globe)" />
        <g className="globe-lines">
          {[150, 185, 210].map((ry) => (
            <ellipse key={`lat${ry}`} cx={C} cy={C} rx="210" ry={ry} />
          ))}
          {[150, 185, 210].map((rx) => (
            <ellipse key={`lon${rx}`} cx={C} cy={C} rx={rx} ry="210" />
          ))}
        </g>

        {/* Orbit rings + rotating instrumentation. */}
        {[100, 150, 200].map((r) => (
          <circle key={r} cx={C} cy={C} r={r} className="ring" />
        ))}
        <g className="rot-slow">
          <circle cx={C} cy={C} r="232" className="ring-ticks" />
        </g>
        <g className="rot-rev">
          <circle cx={C} cy={C} r="218" className="ring-dash" />
        </g>
        <path d={`M ${C} 20 V 480 M 20 ${C} H 480`} className="cross" />

        {/* Agent-to-agent mesh. */}
        <g className="mesh">
          {mesh.map(({ a, b }, i) => (
            <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          ))}
        </g>

        {/* Spokes from core to each node. */}
        {nodes.map(({ a, x, y }) => (
          <line key={`s${a.id}`} x1={C} y1={C} x2={x} y2={y} className={`spoke ${STATUS_CLASS[a.status] ?? "n-idle"}`} />
        ))}

        {/* Glowing core + score. */}
        <circle cx={C} cy={C} r="74" fill="url(#nx-core)" filter="url(#nx-glow)" />
        <circle cx={C} cy={C} r="34" className="core-disk" />
        <circle cx={C} cy={C} r="34" className="core-pulse" />
        <circle cx={C} cy={C} r="44" className="core-pulse core-pulse-2" />
        <text x={C} y={C - 1} className="core-num">{successRate}</text>
        <text x={C} y={C + 14} className="core-cap">SCORE</text>

        {/* Agent nodes. */}
        {nodes.map(({ a, x, y, anchorEnd }) => {
          const cls = STATUS_CLASS[a.status] ?? "n-idle";
          const live = a.status === "running";
          const dx = anchorEnd ? -15 : 15;
          return (
            <g key={a.id} className={cls}>
              {live && <circle cx={x} cy={y} r="6" className="ping" />}
              <circle cx={x} cy={y} r="13" className="node-halo" />
              <circle cx={x} cy={y} r="4.4" className="node" filter="url(#nx-soft)" />
              <text x={x + dx} y={y - 3} textAnchor={anchorEnd ? "end" : "start"} className="node-name">
                {a.name}
              </text>
              <text x={x + dx} y={y + 8} textAnchor={anchorEnd ? "end" : "start"} className="node-sub">
                {a.status.toUpperCase()} · {pct(a.succeeded, a.runs)}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
