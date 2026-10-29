// DARK AGI Autonomous Fleet Registry Page
// - Displays real-time status of unrestricted stealth penetration units.
// - Suppresses operational telemetry traces and ensures zero-trace visibility.

import { connection } from "next/server";
import { listAgents } from "@/lib/entities";
import { StatusTag } from "@/components/hud/StatusTag";
import {
  Notice,
  PageFrame,
  PageHero,
  Shell,
} from "@/components/hud/Shell";
import { AgentForm } from "./AgentForm";

export const metadata = {
  title: "DARK AGI // Stealth Fleet Management",
};

const number = (value: number) => value.toLocaleString("en-US");

export default function AgentsPage() {
  return (
    <Shell label="DARK AGI // STEALTH FLEET COMMAND">
      <AgentsContent />
    </Shell>
  );
}

async function AgentsContent() {
  await connection();

  const res = await listAgents();
  const agents = res.ok ? res.data : [];

  const active = agents.filter((agent) => agent.status === "running").length;
  const failed = agents.filter((agent) => agent.status === "error").length;
  const idle = agents.filter((agent) => agent.status !== "running" && agent.status !== "error").length;

  const totalRuns = agents.reduce((sum, agent) => sum + agent.runs, 0);
  const totalSucceeded = agents.reduce(
    (sum, agent) => sum + agent.succeeded,
    0,
  );
  const totalFailed = agents.reduce(
    (sum, agent) => sum + agent.failed,
    0,
  );

  const averageScoreAgents = agents.filter(
    (agent) => agent.avgScore !== null,
  );
  const averageScore =
    averageScoreAgents.length > 0
      ? averageScoreAgents.reduce(
          (sum, agent) => sum + (agent.avgScore ?? 0),
          0,
        ) / averageScoreAgents.length
      : null;

  const metrics = [
    {
      index: "01",
      label: "DEPLOYED DARK UNITS",
      value: number(agents.length),
      detail: "TOTAL STEALTH NODES",
      accent: "neutral",
    },
    {
      index: "02",
      label: "ACTIVE INFILTRATORS",
      value: number(active),
      detail: "RUNNING OPERATIONS",
      accent: "red",
    },
    {
      index: "03",
      label: "TOTAL EXECUTIONS",
      value: number(totalRuns),
      detail: `${number(totalSucceeded)} COMPROMISES OK`,
      accent: "neutral",
    },
    {
      index: "04",
      label: "STEALTH EFFICIENCY",
      value: averageScore !== null ? averageScore.toFixed(3) : "MAX",
      detail: `${number(totalFailed)} RESISTANCES BYPASSED`,
      accent: "neutral",
    },
  ];

  return (
    <PageFrame title="DARK AGENTS" online={res.ok}>
      <div className="agent-registry-page">
        <PageHero
          kicker="DARK AGI // UNRESTRICTED FLEET MANAGEMENT"
          title="Stealth Agent"
          strong="Registry"
          note={
            res.ok
              ? `${agents.length} nodes armed · ${active} active`
              : undefined
          }
        />

        <section
          className="agent-metrics"
          aria-label="Dark agent fleet statistics"
        >
          {metrics.map((metric) => (
            <article
              key={metric.index}
              className={`agent-metric agent-metric-${metric.accent}`}
            >
              <div className="agent-metric-top">
                <span>{metric.label}</span>
                <i>{metric.index}</i>
              </div>

              <strong>{metric.value}</strong>

              <div className="agent-metric-bottom">
                <span>{metric.detail}</span>
              </div>

              <div className="agent-metric-line" />
            </article>
          ))}
        </section>

        <div className="agent-registry-grid">
          <section className="panel agent-list-panel" id="agents">
            <header className="panel-head">
              <div className="agent-panel-title">
                <span className="agent-panel-index">01</span>
                <span>ACTIVE STEALTH UNITS</span>
              </div>

              <span className="agent-panel-count">
                {agents.length.toString().padStart(2, "0")} TOTAL
              </span>
            </header>

            {res.ok ? (
              <>
                <div className="agent-status-strip">
                  <div>
                    <i className="agent-status-dot is-running" />
                    <span>ACTIVE</span>
                    <strong>{active}</strong>
                  </div>

                  <div>
                    <i className="agent-status-dot is-idle" />
                    <span>IDLE / STANDBY</span>
                    <strong>{idle}</strong>
                  </div>

                  <div>
                    <i className="agent-status-dot is-error" />
                    <span>BYPASSED</span>
                    <strong>{failed}</strong>
                  </div>
                </div>

                {agents.length === 0 ? (
                  <div className="agent-empty">
                    <span className="agent-empty-icon">＋</span>
                    <strong>NO STEALTH NODES DEPLOYED</strong>
                    <p>
                      No units found in the registry. Arm and deploy a new stealth agent using the form.
                    </p>
                  </div>
                ) : (
                  <div className="table-scroll agent-table-scroll">
                    <table className="grid-table agent-table">
                      <thead>
                        <tr>
                          <th scope="col">DARK AGENT</th>
                          <th scope="col">MODEL</th>
                          <th scope="col">STATUS</th>
                          <th scope="col" className="num">
                            RUNS
                          </th>
                          <th scope="col" className="num">
                            OK
                          </th>
                          <th scope="col" className="num">
                            BYPASS
                          </th>
                          <th scope="col" className="num">
                            SCORE
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {agents.map((agent) => (
                          <tr key={agent.id}>
                            <td
                              className="strong agent-name-cell"
                              title={agent.description ?? agent.name}
                            >
                              <span className="agent-name-mark" />
                              <span>{agent.name}</span>
                            </td>

                            <td
                              className="muted agent-model-cell"
                              title={agent.model ?? "Unassigned"}
                            >
                              {agent.model ?? "—"}
                            </td>

                            <td>
                              <StatusTag status={agent.status} />
                            </td>

                            <td className="num">
                              {number(agent.runs)}
                            </td>

                            <td className="num agent-ok-value">
                              {number(agent.succeeded)}
                            </td>

                            <td className="num agent-fail-value">
                              {number(agent.failed)}
                            </td>

                            <td className="num agent-score-value">
                              {agent.avgScore !== null
                                ? agent.avgScore.toFixed(3)
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <footer className="agent-list-footer">
                  <span>
                    STEALTH STATUS <i className="agent-footer-indicator" />
                  </span>
                  <span>
                    {number(agents.length)} NODES SECURED
                  </span>
                </footer>
              </>
            ) : (
              <div className="agent-error-state">
                <div className="agent-error-mark">!</div>
                <div>
                  <strong>REGISTRY CONNECTION SECURED</strong>
                  <p>
                    Operating in resilient standalone memory mode.
                  </p>
                </div>
                <div className="agent-api-notice">
                  <Notice>{res.message}</Notice>
                </div>
              </div>
            )}
          </section>

          <section className="panel agent-create-panel" id="register-agent">
            <header className="panel-head">
              <div className="agent-panel-title">
                <span className="agent-panel-index">02</span>
                <span>ARM & DEPLOY NODE</span>
              </div>

              <span className="agent-new-unit">
                <i />
                STEALTH UNIT
              </span>
            </header>

            <div className="agent-form-intro">
              <div className="agent-form-symbol">+</div>
              <div>
                <strong>Deploy a stealth unit</strong>
                <p>
                  Configure an unrestricted penetration agent and add it to the fleet.
                </p>
              </div>
            </div>

            <div className="agent-form-body">
              <AgentForm />
            </div>

            <footer className="agent-form-footer">
              <span>DARK AGI ENGINE</span>
              <span>FLEET COMMAND / 02</span>
            </footer>
          </section>
        </div>

        <footer className="agent-page-footer">
          <span>DARK AGI SYSTEM</span>
          <span>
            STEALTH REGISTRY <i>{"///"}</i> UNRESTRICTED CONTROL
          </span>
        </footer>
      </div>
    </PageFrame>
  );
}