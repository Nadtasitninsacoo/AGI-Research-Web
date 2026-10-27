import type { AgentStat } from "@/lib/queries";

const C = 250;
const ORBITS = [100, 148, 196];
const GOLDEN = 137.5;

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export function Nexus({ agents, successRate }: { agents: AgentStat[]; successRate: number }) {
  const nodes = agents.map((a, i) => {
    const r = ORBITS[i % ORBITS.length];
    const ang = ((i * GOLDEN - 90) * Math.PI) / 180;
    return { a, x: C + r * Math.cos(ang), y: C + r * Math.sin(ang), right: Math.cos(ang) > 0 };
  });

  return (
    <div className="nexus">
      <div className="sweep" aria-hidden />
      <svg viewBox="0 0 500 500" role="img" aria-label="Agent orbit map">
        <defs>
          <radialGradient id="core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff2a36" stopOpacity="0.9" />
            <stop offset="55%" stopColor="#7d0911" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#7d0911" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g className="rot-slow">
          <circle cx={C} cy={C} r="236" className="ring-ticks" />
        </g>
        <g className="rot-rev">
          <circle cx={C} cy={C} r="222" className="ring-dash" />
        </g>
        {ORBITS.map((r) => (
          <circle key={r} cx={C} cy={C} r={r} className="ring" />
        ))}
        <path d={`M ${C} 14 V 486 M 14 ${C} H 486`} className="cross" />

        <circle cx={C} cy={C} r="62" fill="url(#core)" />
        <circle cx={C} cy={C} r="30" className="core-ring" />
        <text x={C} y={C - 2} className="core-num">{successRate}</text>
        <text x={C} y={C + 13} className="core-cap">SUCCESS %</text>

        {nodes.map(({ a, x, y, right }) => {
          const live = a.status === "running";
          const bad = a.status === "error";
          const cls = live ? "n-live" : bad ? "n-bad" : a.status === "paused" ? "n-pause" : "n-idle";
          return (
            <g key={a.id} className={cls}>
              <line x1={C} y1={C} x2={x} y2={y} className="spoke" />
              {live && <circle cx={x} cy={y} r="5" className="ping" />}
              <circle cx={x} cy={y} r="9" className="node-halo" />
              <circle cx={x} cy={y} r="3.2" className="node" />
              <text x={x + (right ? -16 : 16)} y={y - 2} textAnchor={right ? "end" : "start"} className="node-name">
                {a.name}
              </text>
              <text x={x + (right ? -16 : 16)} y={y + 10} textAnchor={right ? "end" : "start"} className="node-sub">
                {a.status.toUpperCase()} · {pct(a.succeeded, a.runs)}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
