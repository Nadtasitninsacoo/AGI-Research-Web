import type { AgentStat } from "@/lib/queries";

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

/**
 * Reactor-core telemetry view: a glowing core with the overall score, and one
 * gauge row per agent (status colour + real success%). Used on /nexus so it
 * reads differently from the Overview orbit.
 */
export function Reactor({ agents, successRate }: { agents: AgentStat[]; successRate: number }) {
  return (
    <div className="reactor">
      <div className="reactor-core">
        <span className="reactor-ring" />
        <span className="reactor-ring reactor-ring-2" />
        <div className="reactor-orb">
          <b>{successRate}</b>
          <small>SCORE</small>
        </div>
      </div>

      <ul className="reactor-bars">
        {agents.length === 0 && <li className="muted nx-empty">No agents online</li>}
        {agents.map((a) => {
          const success = pct(a.succeeded, a.runs);
          return (
            <li key={a.id} className={`rb s-${a.status}`}>
              <span className="rb-name">
                <i className={`dot dot-${a.status}`} />
                {a.name}
              </span>
              <div className="rb-gauge" role="progressbar" aria-label={`${a.name} success`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={success}>
                <i style={{ width: `${success}%` }} />
              </div>
              <span className="rb-val">{a.runs > 0 ? `${success}%` : "—"}</span>
              <span className="rb-state">{a.status.toUpperCase()}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
