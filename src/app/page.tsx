import { Suspense } from "react";
import { connection } from "next/server";
import { Icon, type IconName } from "@/components/Icon";
import { HeroCosmos } from "@/components/hud/HeroCosmos";
import { Navbar } from "@/components/hud/Navbar";
import { Nexus } from "@/components/hud/Nexus";
import { Sidebar } from "@/components/hud/Sidebar";
import { getDashboardData, type DashboardData } from "@/lib/queries";

const EMPTY: DashboardData = {
  totals: {
    agents: 0,
    agentsRunning: 0,
    projects: 0,
    experiments: 0,
    runs: 0,
    runsRunning: 0,
    runsQueued: 0,
    runsSucceeded: 0,
    runsFailed: 0,
  },
  agents: [],
  runs: [],
  logs: [],
  benchmarks: [],
};

const pct = (n: number, d: number) =>
  d > 0 ? Math.round((n / d) * 100) : 0;

const hhmm = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "--:--"
    : date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
};

const number = (value: number) => value.toLocaleString("en-US");

export default function Home() {
  return (
    <div className="shell" id="top">
      <Suspense
        fallback={
          <>
            <Sidebar online />
            <Booting />
          </>
        }
      >
        <DashboardFrame />
      </Suspense>
    </div>
  );
}

function Booting() {
  return (
    <div className="main">
      <div className="booting">
        <span className="status-pulse" />
        INITIALIZING CORE
        <span className="booting-dots">...</span>
      </div>
    </div>
  );
}

async function DashboardFrame() {
  await connection();

  let data = EMPTY;
  let online = true;

  try {
    data = await getDashboardData();
  } catch {
    online = false;
  }

  const { totals: t, agents, runs, logs, benchmarks } = data;

  const finished = t.runsSucceeded + t.runsFailed;
  const successRate = pct(t.runsSucceeded, finished);
  const maxRuns = Math.max(1, ...agents.map((agent) => agent.runs));

  const kpis: {
    label: string; value: string; sub: string; fill: number; index: string; accent: string; icon: IconName;
  }[] = [
    {
      label: "AGENTS",
      value: number(t.agents),
      sub: `${t.agentsRunning} ACTIVE`,
      fill: pct(t.agentsRunning, t.agents),
      index: "01",
      accent: "red",
      icon: "bot",
    },
    {
      label: "PROJECTS",
      value: number(t.projects),
      sub: "TRACKED",
      fill: Math.min(100, t.projects * 8),
      index: "02",
      accent: "neutral",
      icon: "tag",
    },
    {
      label: "EXPERIMENTS",
      value: number(t.experiments),
      sub: "REGISTERED",
      fill: Math.min(100, t.experiments * 3),
      index: "03",
      accent: "neutral",
      icon: "target",
    },
    {
      label: "RUNS",
      value: number(t.runs),
      sub: `${t.runsRunning} LIVE · ${t.runsQueued} QUEUED`,
      fill: pct(t.runsRunning + t.runsQueued, t.runs),
      index: "04",
      accent: "red",
      icon: "send",
    },
    {
      label: "SUCCESS RATE",
      value: `${successRate}%`,
      sub: `${t.runsFailed} FAILED`,
      fill: successRate,
      index: "05",
      accent: "success",
      icon: "check",
    },
  ];

  const mix = [
    { key: "succeeded", label: "SUCCEEDED", n: t.runsSucceeded },
    { key: "running", label: "RUNNING", n: t.runsRunning },
    { key: "queued", label: "QUEUED", n: t.runsQueued },
    { key: "failed", label: "FAILED", n: t.runsFailed },
  ];

  return (
    <>
      <Sidebar online={online} />

      <div className="main">
        <Navbar
          online={online}
          agentsActive={t.agentsRunning}
          runsInFlight={t.runsRunning}
        />

        <main className="content mission-control">
          <header className="hero mission-hero hero-banner">
            <HeroCosmos />
            <span className="hero-planet" aria-hidden="true">
              <span className="orbit orbit-1"><i className="star" /></span>
              <span className="orbit orbit-2"><i className="star" /></span>
              <span className="orbit orbit-3"><i className="star" /></span>
            </span>
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="eyebrow-mark" />
                AGI RESEARCH PLATFORM
              </div>

              <h1>Dashboard</h1>

              <p className="hero-description">
                Monitor your agents, experiments and research progress in real-time.
              </p>

              <span className={`system-indicator ${online ? "is-online" : "is-offline"}`}>
                <i />
                {online ? "SYSTEM OPERATIONAL" : "DATABASE OFFLINE"}
              </span>
            </div>

            <div className="hero-tagline" aria-hidden="true">
              BUILDING<br />INTELLIGENT<br />TOMORROW
            </div>
          </header>

          <section className="kpis mission-kpis" aria-label="System metrics">
            {kpis.map((kpi) => (
              <article
                className={`kpi mission-kpi accent-${kpi.accent}`}
                key={kpi.label}
              >
                <div className="kpi-topline">
                  <span className="kpi-icon" aria-hidden="true">
                    <Icon name={kpi.icon} />
                  </span>
                  <small>{kpi.label}</small>
                  <span className="kpi-index">{kpi.index}</span>
                </div>

                <b className="kpi-value">{kpi.value}</b>

                <div className="kpi-bottom">
                  <span>{kpi.sub}</span>
                </div>

                <div
                  className="hair"
                  role="progressbar"
                  aria-label={`${kpi.label} indicator`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={kpi.fill}
                >
                  <i style={{ width: `${kpi.fill}%` }} />
                </div>
              </article>
            ))}
          </section>

          <div className="section-divider">
            <span>LIVE INTELLIGENCE</span>
            <i />
            <span className="section-divider-meta">MONITORING / 01</span>
          </div>

          <div className="dashboard-grid">
            <section className="panel span-7 mission-panel" id="nexus">
              <header className="panel-head">
                <div className="panel-heading">
                  <span className="panel-index">01</span>
                  <span>NEXUS</span>
                  <em>AGENT ORBIT MAP</em>
                </div>

                <span className="panel-live">
                  <i />
                  LIVE
                </span>
              </header>

              <div className="nexus-stage">
                <Nexus agents={agents} successRate={successRate} />
              </div>

              <div className="mix mission-mix">
                <div className="mix-heading">
                  <span>EXECUTION DISTRIBUTION</span>
                  <span>{number(t.runs)} TOTAL</span>
                </div>

                <div
                  className="mix-bar"
                  role="img"
                  aria-label={mix
                    .map((item) => `${item.label}: ${item.n}`)
                    .join(", ")}
                >
                  {mix.map((item) => (
                    <i
                      key={item.key}
                      className={`mix-${item.key}`}
                      style={{ flex: item.n, minWidth: item.n > 0 ? 3 : 0 }}
                    />
                  ))}
                </div>

                <ul>
                  {mix.map((item) => (
                    <li key={item.key}>
                      <i className={`mix-${item.key}`} />
                      <span>{item.label}</span>
                      <b>{number(item.n)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="panel span-5 mission-panel" id="agents">
              <header className="panel-head">
                <div className="panel-heading">
                  <span className="panel-index">02</span>
                  <span>AGENT REGISTRY</span>
                </div>

                <em>{agents.length.toString().padStart(2, "0")} REGISTERED</em>
              </header>

              <ul className="registry mission-registry">
                {agents.length === 0 && (
                  <li className="muted empty-state">
                    <span className="empty-state-mark">—</span>
                    No agents registered
                  </li>
                )}

                {agents.map((agent) => {
                  const completion = pct(agent.succeeded, agent.runs);

                  return (
                    <li key={agent.id}>
                      <i className={`dot dot-${agent.status}`} />

                      <div className="reg-name">
                        <b title={agent.name}>{agent.name}</b>
                        <small title={agent.model ?? "unassigned"}>
                          {agent.model ?? "UNASSIGNED"}
                        </small>
                      </div>

                      <div className="reg-meter">
                        <div className="hair">
                          <i style={{ width: `${completion}%` }} />
                        </div>
                        <small>
                          {completion}% <span>·</span> {agent.runs} RUNS
                        </small>
                      </div>

                      <span className="reg-load" title="Relative run volume">
                        {pct(agent.runs, maxRuns)}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <footer className="panel-foot">
                <span>ACTIVE AGENTS</span>
                <b>{t.agentsRunning.toString().padStart(2, "0")}</b>
                <span className="foot-separator">/</span>
                <span>{t.agents.toString().padStart(2, "0")} TOTAL</span>
              </footer>
            </section>

            <section className="panel span-5 mission-panel" id="runs">
              <header className="panel-head">
                <div className="panel-heading">
                  <span className="panel-index">03</span>
                  <span>RUN STREAM</span>
                </div>
                <em>LATEST {runs.length.toString().padStart(2, "0")}</em>
              </header>

              <div className="table-scroll">
                <table className="mission-table">
                  <thead>
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">EXPERIMENT</th>
                      <th scope="col">AGENT</th>
                      <th scope="col">ACC.</th>
                      <th scope="col">STATUS</th>
                    </tr>
                  </thead>

                  <tbody>
                    {runs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted empty-table">
                          No runs recorded
                        </td>
                      </tr>
                    )}

                    {runs.map((run) => (
                      <tr key={run.id}>
                        <td className="muted run-id">#{run.id}</td>
                        <td className="run-experiment" title={run.experiment}>
                          {run.experiment}
                        </td>
                        <td className="muted run-agent" title={run.agent ?? "—"}>
                          {run.agent ?? "—"}
                        </td>
                        <td className="run-accuracy">
                          {run.accuracy != null
                            ? `${(run.accuracy * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                        <td>
                          <span className={`tag tag-${run.status}`}>
                            {run.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel span-3 mission-panel" id="benchmarks">
              <header className="panel-head">
                <div className="panel-heading">
                  <span className="panel-index">04</span>
                  <span>BENCHMARKS</span>
                </div>
                <em>AVG SCORE</em>
              </header>

              <div className="benchmark-list">
                {benchmarks.length === 0 && (
                  <p className="muted empty-state">No evaluations yet</p>
                )}

                {benchmarks.map((benchmark) => {
                  const score = Math.max(
                    0,
                    Math.min(100, Math.round(benchmark.score * 100)),
                  );

                  return (
                    <div className="bench" key={benchmark.benchmark}>
                      <div>
                        <span title={benchmark.benchmark}>
                          {benchmark.benchmark}
                        </span>
                        <b>{(benchmark.score * 100).toFixed(1)}</b>
                      </div>

                      <div
                        className="hair"
                        role="progressbar"
                        aria-label={`${benchmark.benchmark} score`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={score}
                      >
                        <i style={{ width: `${score}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="panel span-4 mission-panel" id="logs">
              <header className="panel-head">
                <div className="panel-heading">
                  <span className="panel-index">05</span>
                  <span>SYSTEM LOG</span>
                </div>
                <em>TAIL {logs.length.toString().padStart(2, "0")}</em>
              </header>

              <ul className="log mission-log">
                {logs.length === 0 && (
                  <li className="muted empty-state">System log is empty</li>
                )}

                {logs.map((log) => (
                  <li key={log.id} className={`log-${log.level}`}>
                    <time dateTime={log.createdAt}>{hhmm(log.createdAt)}</time>
                    <b title={log.agent}>{log.agent}</b>
                    <span title={log.message}>{log.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <footer className="dashboard-footer">
            <span>AGI RESEARCH SYSTEM</span>
            <span>MISSION CONTROL <i>{"///"}</i> OVERVIEW</span>
            <a href="#top">BACK TO TOP ↑</a>
          </footer>
        </main>
      </div>
    </>
  );
}
