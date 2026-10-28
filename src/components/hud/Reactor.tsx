import type { AgentStat } from "@/lib/queries";
import { NuclearMark } from "./NuclearMark";

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

/**
 * Reactor-core telemetry view: a glowing core with the overall score, and one
 * gauge row per agent (status colour + real success%). Used on /nexus so it
 * reads differently from the Overview orbit.
 */
export function Reactor({ agents, successRate }: { agents: AgentStat[]; successRate: number }) {
  const runs = agents.reduce((s, a) => s + a.runs, 0);
  // Any running agent drives the core "critical": orbits spin, nucleus flares.
  const reacting = agents.some((a) => a.status === "running");
  return (
    <div className="reactor">
      {/* Atom: a blue/black radiation nucleus with two numbered "electron" orbs
          riding crossed orbital rings. Goes critical while an agent runs. */}
      <div className={`reactor-atom${reacting ? " is-reacting" : ""}`}>
        <span className="atom-orbit atom-orbit-a" />
        <span className="atom-orbit atom-orbit-b" />
        <span className="atom-orbit atom-orbit-c" />

        <div className="atom-electron atom-electron-l">
          <b>{successRate}</b>
          <small>SCORE</small>
        </div>

        <div className="atom-nucleus">
          <NuclearMark className="nucleus-mark" />
        </div>

        <div className="atom-electron atom-electron-r">
          <b>{runs}</b>
          <small>RUNS</small>
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
