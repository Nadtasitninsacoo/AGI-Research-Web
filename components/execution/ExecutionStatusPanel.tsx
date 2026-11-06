import { Cpu, FlaskConical, Target } from "lucide-react";

import type { Agent, Experiment, RunMode } from "@/lib/execution/types";

import { s } from "./classNames";

type Props = {
  ready: boolean;
  experimentCount: number;
  agentCount: number;
  selectedExperiment: Experiment | undefined;
  selectedAgent: Agent | undefined;
  runMode: RunMode;
  teamCount: number;
};

export function ExecutionStatusPanel({
  ready,
  experimentCount,
  agentCount,
  selectedExperiment,
  selectedAgent,
  runMode,
  teamCount,
}: Props) {
  return (
    <aside className={`${s.panel} ${s.panelCyan} ${s.sticky}`}>
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

        <p className={s.note}>
          Runs are created through the authenticated Research API. Results and
          execution logs are displayed on the Run Monitor page.
        </p>
      </div>
    </aside>
  );
}
