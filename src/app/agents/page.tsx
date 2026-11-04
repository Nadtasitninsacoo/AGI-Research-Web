// Agent registry page
// - Displays real-time status of registered research agents.

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
  title: "Agents // AGI Research",
};

const number = (value: number) => value.toLocaleString("en-US");

export default function AgentsPage() {
  return (
    <Shell label="AGI RESEARCH // AGENT REGISTRY">
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
      label: "REGISTERED AGENTS",
      value: number(agents.length),
      detail: "TOTAL AGENTS",
      accent: "neutral",
    },
    {
      index: "02",
      label: "ACTIVE AGENTS",
      value: number(active),
      detail: "RUNNING OPERATIONS",
      accent: "red",
    },
    {
      index: "03",
      label: "TOTAL EXECUTIONS",
      value: number(totalRuns),
      detail: `${number(totalSucceeded)} SUCCEEDED`,
      accent: "neutral",
    },
    {
      index: "04",
      label: "AVG SCORE",
      value: averageScore !== null ? averageScore.toFixed(3) : "—",
      detail: `${number(totalFailed)} FAILED`,
      accent: "neutral",
    },
  ];

  return (
    <PageFrame title="AGENTS" online={res.ok}>
      <div className="agent-registry-page">
        <PageHero
          kicker="AGI RESEARCH // AGENT MANAGEMENT"
          title="Agent"
          strong="Registry"
          note={
            res.ok
              ? `${agents.length} agents · ${active} active`
              : undefined
          }
        />

        <section
          className="agent-metrics"
          aria-label="Agent registry statistics"
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
                <span>ACTIVE AGENTS</span>
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
                    <span>ERROR</span>
                    <strong>{failed}</strong>
                  </div>
                </div>

                {agents.length === 0 ? (
                  <div className="agent-empty">
                    <span className="agent-empty-icon">＋</span>
                    <strong>NO AGENTS REGISTERED</strong>
                    <p>
                      No agents found in the registry. Create a new agent using the form.
                    </p>
                  </div>
                ) : (
                  <div className="table-scroll agent-table-scroll">
                    <table className="grid-table agent-table">
                      <thead>
                        <tr>
                          <th scope="col">AGENT</th>
                          <th scope="col">MODEL</th>
                          <th scope="col">STATUS</th>
                          <th scope="col" className="num">
                            RUNS
                          </th>
                          <th scope="col" className="num">
                            OK
                          </th>
                          <th scope="col" className="num">
                            FAIL
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
                    STATUS <i className="agent-footer-indicator" />
                  </span>
                  <span>
                    {number(agents.length)} AGENTS REGISTERED
                  </span>
                </footer>
              </>
            ) : (
              <div className="agent-error-state">
                <div className="agent-error-mark">!</div>
                <div>
                  <strong>REGISTRY CONNECTION UNAVAILABLE</strong>
                  <p>
                    Operating in standalone memory mode.
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
                <span>CREATE AGENT</span>
              </div>

              <span className="agent-new-unit">
                <i />
                NEW AGENT
              </span>
            </header>

            <div className="agent-form-intro">
              <div className="agent-form-symbol">+</div>
              <div>
                <strong>Register an agent</strong>
                <p>
                  Configure a research agent and add it to the registry.
                </p>
              </div>
            </div>

            <div className="agent-form-body">
              <AgentForm />
            </div>

            <footer className="agent-form-footer">
              <span>AGI RESEARCH ENGINE</span>
              <span>REGISTRY / 02</span>
            </footer>
          </section>
        </div>

        <footer className="agent-page-footer">
          <span>AGI RESEARCH SYSTEM</span>
          <span>
            AGENT REGISTRY <i>{"///"}</i> RESEARCH CONTROL
          </span>
        </footer>
      </div>
    </PageFrame>
  );
}