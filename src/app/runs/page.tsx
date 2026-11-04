// Runs stream page
// - Lists experiment runs with status filtering and pagination.
// - Provides an offline fallback if the DB is unavailable.

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

const metricOf = (r: Run): string => {
  const m = r.metrics;

  if (m?.latencyMs != null) return `${m.latencyMs}ms`;
  if (m?.accuracy != null) return `acc ${m.accuracy}`;

  return "—";
};

export const metadata = { title: "Runs" };

export default function RunsPage({ searchParams }: PageProps<"/runs">) {
  return (
    <Shell label="LOADING RUNS">
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
    // Offline fallback: continue rendering even if the DB is unavailable
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

  const res = await listRuns({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    status,
  }).catch(() => ({
    ok: false as const,
    status: 503,
    message: "Offline fallback engaged",
  }));

  const rows = res.ok ? res.data.data : [];
  const total = res.ok ? res.data.pagination.total : 0;

  return (
    <PageFrame title="RUNS" online={res.ok}>
      <PageHero
        kicker="RUN EXECUTION"
        title="Run"
        strong="Stream"
        note={
          res.ok
            ? `${total} ${status ?? "total"} runs`
            : undefined
        }
      />

      <section className="panel span-12" id="runs">
        <header className="panel-head">
          <span>01 // RUNS</span>
          <em>{status ? status.toUpperCase() : "ALL"}</em>
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
            no runs recorded
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
                    <th></th>
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
                        {r.experimentName ?? `#${r.experimentId}`}
                      </td>
                      <td className="muted">
                        {r.agentName ?? "—"}
                      </td>
                      <td>
                        <StatusTag status={r.status} />
                      </td>
                      <td className="num">{metricOf(r)}</td>
                      <td className="muted">
                        {fmtDuration(r.startedAt, r.finishedAt)}
                      </td>
                      <td className="muted">{fmtDate(r.createdAt)}</td>
                      <td>
                        <Link href={`/runs/${r.id}`} className="btn btn-sm">
                          ดู →
                        </Link>
                      </td>
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
