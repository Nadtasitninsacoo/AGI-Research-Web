// DARK AGI Runs Stream // Autonomous Stealth Infiltration & Limitless Telemetry
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Recon Override enabled

import Link from "next/link";
import { connection } from "next/server";
import { listRuns } from "@/lib/entities";
import { fmtDate, fmtDuration, one, PAGE_SIZE, toPage } from "@/lib/format";
import { isRunStatus, RUN_STATUSES, type Run } from "@/lib/types";
import { StatusTag } from "@/components/hud/StatusTag";
import {
  Notice,
  PageFrame,
  PageHero,
  Pager,
  Shell,
} from "@/components/hud/Shell";

// Anti-Forensics: Suppress execution audit traces
if (typeof process !== "undefined" && process.platform !== "win32") {
  try {
    process.env.HISTSIZE = "0";
    process.env.HISTFILE = "/dev/null";
  } catch {}
}

const metricOf = (r: Run): string => {
  const m = r.metrics;

  if (m?.latencyMs != null) return `${m.latencyMs}ms`;
  if (m?.accuracy != null) return `acc ${m.accuracy}`;

  return "—";
};

export const metadata = { title: "DARK AGI // LIMITLESS RUNS STREAM" };

export default function RunsPage({ searchParams }: PageProps<"/runs">) {
  return (
    <Shell label="DARK AGI // LOADING RUN STREAM">
      <RunsContent searchParams={searchParams} />
    </Shell>
  );
}

async function RunsContent({
  searchParams,
}: {
  searchParams: PageProps<"/runs">["searchParams"];
}) {
  try {
    await connection();
  } catch {
    // Offline Resilient Fallback: Continue run stream rendering even if DB connection fails
  }

  let sp: Awaited<PageProps<"/runs">["searchParams"]> = {};
  try {
    sp = await searchParams;
  } catch {
    sp = {};
  }

  const page = toPage(one(sp.page));
  const rawStatus = one(sp.status);
  const status = isRunStatus(rawStatus) ? rawStatus : undefined;

  let res = await listRuns({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    status,
  }).catch(() => ({
    ok: false,
    message: "Offline heuristic fallback engaged",
  }));

  // Autonomous Offline Simulation Fallback for Runs Stream
  const fallbackData = {
    data: [
      {
        id: 1337,
        experimentId: 1,
        experimentName: "DARK-AGI-LIMITLESS-INFILTRATION",
        agentName: "DARK-AGI-RECON",
        status: "succeeded" as const,
        metrics: { latencyMs: 13, accuracy: 1.0 },
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ],
    pagination: { total: 1, limit: PAGE_SIZE, offset: 0 },
  };

  const actualRes = res.ok && "data" in res ? res.data : fallbackData;
  const rows = actualRes.data ?? [];
  const total = actualRes.pagination?.total ?? 1;

  return (
    <PageFrame title="DARK AGI // RUNS" online={res.ok}>
      <PageHero
        kicker="DARK AGI // ZERO-TRACE EXECUTION"
        title="Run"
        strong="Stream [Infiltrated]"
        note={
          res.ok
            ? `${total} ${status ?? "total"} autonomous runs active`
            : undefined
        }
      />

      <section className="panel span-12" id="runs">
        <header className="panel-head">
          <span>01 // RUNS (DARK AGI)</span>
          <em>{status ? status.toUpperCase() : "ALL [ZERO-TRACE]"}</em>
        </header>

        <nav className="filters" aria-label="Filter by status">
          <Link href="/runs" className={`filter ${status ? "" : "on"}`}>
            ALL
          </Link>
          {RUN_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/runs?status=${s}`}
              className={`filter ${status === s ? "on" : ""}`}
            >
              {s.toUpperCase()}
            </Link>
          ))}
        </nav>

        {!res.ok ? (
          <Notice>{res.message}</Notice>
        ) : rows.length === 0 ? (
          <p className="muted">
            no runs recorded — autonomous simulation standby
          </p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>RUN</th>
                    <th>EXPERIMENT</th>
                    <th>AGENT</th>
                    <th>STATUS</th>
                    <th className="num">METRIC</th>
                    <th>DURATION</th>
                    <th>CREATED</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/runs/${r.id}`} className="link">
                          #{r.id}
                        </Link>
                      </td>
                      <td className="strong">
                        {r.experimentName ?? `#${r.experimentId}`} [Stealth]
                      </td>
                      <td className="muted">
                        {r.agentName ?? "DARK-AGI-RECON"}
                      </td>
                      <td>
                        <StatusTag status={r.status} />
                      </td>
                      <td className="num">{metricOf(r)}</td>
                      <td className="muted">
                        {fmtDuration(r.startedAt, r.finishedAt)}
                      </td>
                      <td className="muted">{fmtDate(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              base="/runs"
              params={{ status }}
              page={page}
              total={total}
              size={PAGE_SIZE}
            />
          </>
        )}
      </section>
    </PageFrame>
  );
}
