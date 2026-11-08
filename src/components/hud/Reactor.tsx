import type { AgentStat } from "@/lib/queries";
import { NuclearMark } from "./NuclearMark";
import { agentStatusMeta } from "@/lib/agentStatus";

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

/**
 * Reactor-core telemetry view: a glowing core with the overall score, and one
 * gauge row per agent (status colour + real success%). Used on /nexus so it
 * reads differently from the Overview orbit.
 */
export function Reactor({
  agents,
  successRate,
  runningRuns = 0,
}: {
  agents: AgentStat[];
  successRate: number;
  /** Runs actually in flight right now — the reliable "system is working"
   *  signal (agents.status can be stale, and sub-agents under an orchestrator
   *  never flip it). */
  runningRuns?: number;
}) {
  const runs = agents.reduce((s, a) => s + a.runs, 0);
  // React whenever real work is happening: any run in flight OR any agent marked
  // running. The harder the fleet works, the stronger the motion.
  const runningCount = agents.filter((a) => a.status === "running").length;
  const activeRuns = Math.max(0, runningRuns);
  const reacting = activeRuns > 0 || runningCount > 0;
  const byAgents = agents.length > 0 ? runningCount / agents.length : 0;
  const intensity = reacting ? Math.min(1, Math.max(byAgents, activeRuns > 0 ? 0.6 : 0)) : 0;
  return (
    <div className="reactor">
      {/* Atom: a blue/black radiation nucleus with two numbered "electron" orbs
          riding crossed orbital rings. Motion scales with --react (0..1). */}
      <div
        className={`reactor-atom${reacting ? " is-reacting" : ""}`}
        style={{ "--react": intensity } as Record<string, string | number>}
      >
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
          const stat = agentStatusMeta(a.status);
          return (
            <li key={a.id} className={`rb s-${stat.tone}`}>
              <span className="rb-name">
                <i className={`dot dot-${stat.tone}`} />
                {a.name}
              </span>
              <div className="rb-gauge" role="progressbar" aria-label={`${a.name} success`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={success}>
                <i style={{ width: `${success}%` }} />
              </div>
              <span className="rb-val">{a.runs > 0 ? `${success}%` : "—"}</span>
              <span className="rb-state">{stat.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
