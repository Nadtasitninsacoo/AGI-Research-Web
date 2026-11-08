// Nexus Console — agent telemetry and run intelligence overview.
import { Suspense } from "react";
import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { CopyButton } from "@/components/hud/CopyButton";
import { Navbar } from "@/components/hud/Navbar";
import { Reactor } from "@/components/hud/Reactor";
import { Sidebar } from "@/components/hud/Sidebar";
import { db } from "@/lib/db";
import {
  getDashboardData,
  type DashboardData,
  type LogRow,
} from "@/lib/queries";
import { agentStatusMeta } from "@/lib/agentStatus";

export const metadata = {
  title: "Nexus — Agent Telemetry",
};

// Honest empty fallback used only when the DB is unreachable — no fabricated
// agents, runs or logs.
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

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const hhmmss = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "--:--:--"
    : d.toLocaleTimeString("en-GB", { hour12: false });
};

export default function NexusPage() {
  return (
    <div className="shell nexus-shell" id="top">
      <Suspense
        fallback={
          <>
            <Sidebar online />
            <div className="main">
              <div className="booting">
                LINKING NEXUS<span>...</span>
              </div>
            </div>
          </>
        }
      >
        <NexusConsole />
      </Suspense>
    </div>
  );
}

async function NexusConsole() {
  let online = true;
  let data = EMPTY;
  try {
    await connection();
    data = await getDashboardData();
  } catch {
    online = false;
  }
  const { totals: t, agents, logs } = data.agents.length > 0 ? data : EMPTY;
  const successRate = pct(t.runsSucceeded, t.runsSucceeded + t.runsFailed);
  const live = t.runsRunning > 0; // live only when a run is actually in flight

  // Operation intel from the latest finished run; null when unavailable.
  let op: Operation | null = null;
  try {
    op = await latestOperation();
  } catch {
    op = null;
  }

  // TASK FLOW: delegate / plan / run / synthesis milestones from real logs only.
  const flow = logs
    .filter((l) =>
      /\b(DELEGATE|HYDRA|RUN STARTED|Run started|synthesis|VERIFY|ESCALATE|HANDOFF)\b/i.test(
        l.message,
      ),
    )
    .slice(0, 6);

  // COMMAND STREAM: the actual commands agents executed and their results.
  const stream = logs
    .filter((l) =>
      /^(RUN |EXIT |NORMALIZED|NEEDS APPROVAL|APPROVED|APPROVAL|SCOPE BLOCK|POLICY DENY|NO VERIFIABLE)/.test(
        l.message,
      ),
    )
    .slice(0, 14);

  return (
    <>
      <Sidebar online={online} />
      <div className="main nexus-console">
        <Navbar online={online} title="NEXUS" />
        <div className="nx-opbar">
          <div className="nx-opbar-id">
            <b>AGI RESEARCH</b>
            <span>AGENT TELEMETRY</span>
          </div>
          <nav className="nx-phases" aria-label="Operation phases">
            {["RECON", "ANALYZE", "EXECUTE", "REPORT"].map((p) => (
              <span key={p} className="nx-phase">
                {p}
              </span>
            ))}
          </nav>
          <OpLive live={live} />
        </div>
        <div className="nexus-grid">
          {/* ---------- LEFT COLUMN ---------- */}
          <div className="nx-col">
            <section className="panel nx-panel">
              <header className="panel-head">
                <div className="panel-heading">
                  <span>AGENTS</span>
                </div>
                <em>{agents.length}</em>
              </header>
              <ul className="nx-agent-list">
                {agents.length === 0 && (
                  <li className="muted nx-empty">No agents</li>
                )}
                {agents.map((a) => {
                  const stat = agentStatusMeta(a.status);
                  const completion = pct(a.succeeded, a.runs);
                  return (
                    <li key={a.id}>
                      <div className="nx-agent-head">
                        <i className={`dot dot-${stat.tone}`} />
                        <div className="nx-agent-id">
                          <b>{a.name}</b>
                          <small>
                            {a.description?.split("\n")[0] ?? a.model ?? "—"}
                          </small>
                        </div>
                        <span className={`nx-agent-state s-${stat.tone}`}>
                          {stat.label}
                        </span>
                      </div>
                      <div className="nx-agent-prog">
                        <div
                          className="hair"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={completion}
                          aria-label={`${a.name} completion`}
                        >
                          <i style={{ width: `${completion}%` }} />
                        </div>
                        <div className="nx-agent-meta">
                          <span>
                            <b className={completion >= 100 ? "is-ok" : ""}>
                              {completion}%
                            </b>{" "}
                            สำเร็จ
                          </span>
                          <span>
                            <b>{a.succeeded}</b>/{a.runs} run
                          </span>
                          {a.failed > 0 && (
                            <span>
                              <b>{a.failed}</b> fail
                            </span>
                          )}
                          {a.avgScore != null && (
                            <span>
                              score <b>{a.avgScore.toFixed(2)}</b>
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="panel nx-panel">
              <header className="panel-head">
                <div className="panel-heading">
                  <span>TASK FLOW</span>
                </div>
                {flow.length > 0 && (
                  <CopyButton
                    text={flow
                      .map((l) => `${hhmmss(l.createdAt)} ${l.message}`)
                      .join("\n")}
                    label="all"
                  />
                )}
              </header>
              <ol className="nx-timeline">
                {flow.length === 0 && (
                  <li className="muted nx-empty">No task activity yet</li>
                )}
                {flow.map((l) => (
                  <li key={l.id} className={`tl-${l.level}`}>
                    <time>{hhmmss(l.createdAt)}</time>
                    <span>{l.message}</span>
                    <CopyButton
                      text={l.message}
                      label=""
                      className="copy-inline"
                    />
                  </li>
                ))}
              </ol>
            </section>

            <section className="panel nx-panel">
              <header className="panel-head">
                <div className="panel-heading">
                  <span>SYSTEM</span>
                </div>
                <em>{online ? "DB ONLINE" : "DB OFFLINE"}</em>
              </header>
              <dl className="nx-kv">
                <dt>MODEL</dt>
                <dd>{agents.find((a) => a.model)?.model ?? "—"}</dd>
                <dt>AGENTS</dt>
                <dd>{t.agents}</dd>
                <dt>EXPERIMENTS</dt>
                <dd>{t.experiments}</dd>
                <dt>RUNS</dt>
                <dd>{t.runs}</dd>
              </dl>
            </section>
          </div>

          {/* ---------- CENTER COLUMN ---------- */}
          <div className="nx-col">
            <section className="panel nx-panel nx-osint" id="nexus">
              <header className="panel-head">
                <div className="panel-heading">
                  <span>CORE REACTOR</span>
                  <em>AGENT ACTIVITY</em>
                </div>
                <OpLive live={live} />
              </header>
              <div className="nx-stage">
                <Reactor agents={agents} successRate={successRate} runningRuns={t.runsRunning} />
              </div>
            </section>

            <section className="panel nx-panel nx-stream">
              <header className="panel-head">
                <div className="panel-heading">
                  <span>COMMAND STREAM</span>
                  <em>EXEC</em>
                </div>
                {stream.length > 0 && (
                  <CopyButton
                    text={stream.map((l) => l.message).join("\n")}
                    label="all"
                  />
                )}
              </header>
              <ul className="nx-term">
                {stream.length === 0 && (
                  <li className="muted nx-empty">
                    $ awaiting command execution…
                  </li>
                )}
                {stream.map((l) => (
                  <li key={l.id} className={`t-${l.level}`}>
                    <time>{hhmmss(l.createdAt)}</time>
                    <code>{l.message}</code>
                    <CopyButton
                      text={l.message}
                      label=""
                      className="copy-inline"
                    />
                  </li>
                ))}
              </ul>
            </section>

          </div>

          {/* ---------- RIGHT COLUMN ---------- */}
          <div className="nx-col">
            <section className="panel nx-panel">
              <header className="panel-head">
                <div className="panel-heading">
                  <span>OPERATION INTEL</span>
                  {op && <em>run #{op.runId}</em>}
                </div>
              </header>
              <OperationIntel op={op} />
            </section>

            <section className="panel nx-panel">
              <header className="panel-head">
                <div className="panel-heading">
                  <span>REAL-TIME LOG</span>
                </div>
                <div className="panel-head-actions">
                  <em>TAIL {logs.length}</em>
                  {logs.length > 0 && (
                    <CopyButton
                      text={logs
                        .map(
                          (l) =>
                            `${hhmmss(l.createdAt)} [${l.level.toUpperCase()}] ${l.agent}: ${l.message}`,
                        )
                        .join("\n")}
                      label="all"
                    />
                  )}
                </div>
              </header>
              <ul className="nx-logfeed">
                {logs.length === 0 && (
                  <li className="muted nx-empty">ยังไม่มี log</li>
                )}
                {logs.map((l) => (
                  <LogLine key={l.id} l={l} />
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function LogLine({ l }: { l: LogRow }) {
  return (
    <li className={`lf-${l.level}`}>
      <time>{hhmmss(l.createdAt)}</time>
      <b>{l.level.toUpperCase()}</b>
      <span>{l.message}</span>
      <CopyButton text={l.message} label="" className="copy-inline" />
    </li>
  );
}

function AwaitingData({ label }: { label: string }) {
  return (
    <div className="nx-awaiting">
      <span className="nx-awaiting-mark" />
      <p>{label}</p>
    </div>
  );
}

/** LIVE only when a run is actually in flight; otherwise STANDBY (honest). */
function OpLive({ live }: { live: boolean }) {
  return (
    <span className={`nx-oplive ${live ? "is-live" : "is-standby"}`}>
      <i
        style={
          live
            ? { background: "var(--ok)", boxShadow: "0 0 8px var(--ok)" }
            : { background: "#55555e" }
        }
      />
      {live ? "LIVE" : "STANDBY"}
    </span>
  );
}

type Subtask = {
  agent: string;
  verified?: boolean;
  verifyReason?: string;
  status?: string;
};
type Handoff = { to: string; ok?: boolean; chars?: number; sources?: string[] };
type NeedsAuth = { agent: string; task?: string };
type OpMetrics = {
  verification?: {
    verifiedCount?: number;
    total?: number;
    confirmedFindings?: number;
    unconfirmedFindings?: number;
  };
  subResults?: Subtask[];
  handoffs?: Handoff[];
  needsAuthorization?: NeedsAuth[];
};
type Operation = {
  runId: number;
  experiment: string;
  agent: string | null;
  status: string;
  metrics: OpMetrics;
};

/** Latest finished run with its orchestration metrics — the verification detail is unique to /nexus. */
async function latestOperation(): Promise<Operation | null> {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT r.id, r.status, r.metrics, e.name AS experiment, a.name AS agent
       FROM experiment_runs r
       JOIN experiments e ON e.id = r.experiment_id
       LEFT JOIN agents a ON a.id = e.agent_id
       WHERE r.metrics IS NOT NULL AND r.status IN ('succeeded', 'failed', 'needs_input')
       ORDER BY r.id DESC LIMIT 1`,
    );
    const r = rows[0];
    if (!r) {
      // No finished run with metrics yet — show the honest awaiting state.
      return null;
    }
    const metrics = (
      typeof r.metrics === "object"
        ? r.metrics
        : JSON.parse(String(r.metrics ?? "{}"))
    ) as OpMetrics;
    return {
      runId: r.id as number,
      experiment: r.experiment as string,
      agent: (r.agent as string) ?? null,
      status: r.status as string,
      metrics,
    };
  } catch {
    // DB unreachable — no fabricated operation; show the awaiting state.
    return null;
  }
}

function OperationIntel({ op }: { op: Operation | null }) {
  if (!op)
    return <AwaitingData label="ยังไม่มี run ที่มีผลการตรวจสอบเชิงลึก" />;
  const m = op.metrics ?? {};
  const v = m.verification;
  const subs = m.subResults ?? [];
  const handoffs = m.handoffs ?? [];
  const auth = m.needsAuthorization ?? [];

  return (
    <div className="nx-intel">
      <div className="nx-intel-top">
        <span className="nx-intel-run">{op.experiment}</span>
        <span className={`tag tag-${op.status}`}>{op.status}</span>
      </div>

      {subs.length === 0 ? (
        <p className="muted nx-intel-note">
          รันเดี่ยว — ไม่มีการแบ่งงานย่อย (single-agent run)
        </p>
      ) : !v ? (
        <>
          <p className="muted nx-intel-note">
            ผลงานย่อยของแต่ละเอเจนต์
          </p>
          <ul className="nx-intel-subs">
            {subs.map((s, i) => (
              <li key={i} className="na">
                <span className="mark">·</span>
                <b>{s.agent}</b>
                <small>{s.status}</small>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="nx-intel-stats">
            <span>
              <b>
                {v.verifiedCount ?? 0}/{v.total ?? subs.length}
              </b>{" "}
              verified
            </span>
            <span>
              <b>{v.confirmedFindings ?? 0}</b> confirmed
            </span>
            <span>
              <b>{v.unconfirmedFindings ?? 0}</b> unverified
            </span>
            <span className={auth.length ? "is-warn" : ""}>
              <b>{auth.length}</b> need auth
            </span>
          </div>
          <ul className="nx-intel-subs">
            {subs.map((s, i) => (
              <li key={i} className={s.verified ? "ok" : "bad"}>
                <span className="mark">{s.verified ? "✓" : "✗"}</span>
                <b>{s.agent}</b>
                <small>{s.verifyReason ?? s.status}</small>
              </li>
            ))}
          </ul>
          {handoffs.length > 0 && (
            <div className="nx-intel-row">
              handoff:{" "}
              {handoffs.map((h, i) => (
                <span key={i} className={h.ok ? "ok" : "bad"}>
                  →{h.to}
                  {h.ok ? "" : " (dropped)"}
                </span>
              ))}
            </div>
          )}
          {auth.length > 0 && (
            <div className="nx-intel-row is-warn">
              ⚠ ต้องอนุมัติจากคน: {auth.map((a) => a.agent).join(", ")}
            </div>
          )}
        </>
      )}
    </div>
  );
}
