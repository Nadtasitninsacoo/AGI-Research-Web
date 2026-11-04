import { Activity, Cpu, FlaskConical, Target, Users } from "lucide-react";
import Link from "next/link";

import type { Agent, Experiment, RunMode } from "@/lib/execution/types";
import { agentStatusMeta } from "@/lib/agentStatus";

import { s } from "./classNames";

type Props = {
  ready: boolean;
  experimentCount: number;
  agentCount: number;
  selectedExperiment: Experiment | undefined;
  selectedAgent: Agent | undefined;
  runMode: RunMode;
  teamCount: number;
  activeAgents?: Agent[];
};

export function ExecutionStatusPanel({
  ready,
  experimentCount,
  agentCount,
  selectedExperiment,
  selectedAgent,
  runMode,
  teamCount,
  activeAgents = [],
}: Props) {
  return (
    <aside className={`${s.panel} ${s.panelCyan} ${s.areaStatus}`}>
      <header className={s.head}>
        <h2 className={s.title}>
          <span className={s.iconChip}>
            <Target size={13} />
          </span>
          <span>
            <span className={s.titleNum}>02</span> {"//"} EXECUTION STATUS
          </span>
        </h2>
        <span className={`${s.badge} ${s.badgeCyan}`}>API</span>
      </header>

      <div className={s.statusBody}>
        <div className={`${s.ready} ${ready ? s.readyOn : s.readyOff}`}>
          <span className={s.pulse} aria-hidden />
          <span className={s.readyText}>
            <span className={s.readyTitle}>
              {ready ? "READY TO EXECUTE" : "AWAITING SELECTION"}
            </span>
            <span className={s.readySub}>
              {ready
                ? "Experiment and agent selected"
                : "Select an experiment and an agent"}
            </span>
          </span>
        </div>

        <div className={s.stats}>
          <div className={s.stat}>
            <div className={s.statLabel}>
              <FlaskConical size={11} />
              EXPERIMENTS
            </div>
            <div className={s.statValue}>{experimentCount}</div>
          </div>
          <div className={s.stat}>
            <div className={s.statLabel}>
              <Cpu size={11} />
              AGENTS
            </div>
            <div className={s.statValue}>{agentCount}</div>
          </div>
        </div>

        <dl className={s.kv}>
          <div className={s.kvRow}>
            <dt>SELECTED EXPERIMENT</dt>
            <dd
              className={selectedExperiment ? "" : s.none}
              title={selectedExperiment?.name}
            >
              {selectedExperiment?.name ?? "none"}
            </dd>
          </div>
          <div className={s.kvRow}>
            <dt>SELECTED AGENT</dt>
            <dd
              className={selectedAgent ? "" : s.none}
              title={selectedAgent?.name}
            >
              {selectedAgent?.name ?? "none"}
            </dd>
          </div>
          <div className={s.kvRow}>
            <dt>EXECUTION MODE</dt>
            <dd>{runMode === "team" ? "START TEAM RUN" : "START RUN"}</dd>
          </div>

          {runMode === "team" && (
            <div className={s.kvRow}>
              <dt>TEAM MEMBERS</dt>
              <dd>{teamCount} AGENTS</dd>
            </div>
          )}
        </dl>

        {/* Live count + real per-agent status + activity graph of the agents
            participating in this run (updates as you select agents). */}
        <div className={s.agentPanel}>
          <div className={s.agentPanelHead}>
            <span className={s.agentPanelLabel}>
              <Users size={11} />
              {runMode === "team" ? "TEAM AGENTS" : "ACTIVE AGENT"}
            </span>
            <b className={s.agentPanelCount}>{activeAgents.length}</b>
          </div>

          {activeAgents.length === 0 ? (
            <p className={s.none}>No agent selected</p>
          ) : (
            <>
              <div
                className={s.agentBars}
                aria-hidden
                data-reacting={activeAgents.some(
                  (a) => String(a.status).toLowerCase() === "running",
                )}
              >
                {activeAgents.map((agent, i) => {
                  const stat = agentStatusMeta(agent.status);
                  return (
                    <i
                      key={agent.id}
                      className={`ex-eqbar ex-eqbar-${stat.tone}`}
                      style={{ animationDelay: `${(i % 8) * 0.12}s` }}
                    />
                  );
                })}
              </div>

              <ul className={s.agentStatList}>
                {activeAgents.map((agent) => {
                  const stat = agentStatusMeta(agent.status);
                  return (
                    <li key={agent.id} className={s.agentStatRow}>
                      <i className={`dot dot-${stat.tone}`} />
                      <span className={s.agentStatName} title={agent.name}>
                        {agent.name}
                      </span>
                      <em className={`s-${stat.tone}`}>{stat.label}</em>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <p className={s.note}>
          Runs are created through the authenticated Research API. Results and
          execution logs are displayed on the Run Monitor page.
        </p>

        {/* Open the Run Monitor (any run's live graph/status) without starting
            a new run via START RUN. */}
        <Link
          href="/runs"
          className={`${s.btn} ${s.btnGhost}`}
          style={{
            width: "100%",
            justifyContent: "center",
            marginTop: 4,
            textDecoration: "none",
          }}
        >
          <Activity size={14} />
          RUN MONITOR · ดูผลรัน
        </Link>
      </div>
    </aside>
  );
}
