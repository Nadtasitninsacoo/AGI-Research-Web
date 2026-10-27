import { connection } from "next/server";
import { apiGet } from "@/lib/api";
import { fmtDate, one, PAGE_SIZE, toPage } from "@/lib/format";
import type { Agent, Experiment, Paginated, Project } from "@/lib/types";
import { StatusTag } from "@/components/hud/StatusTag";
import { Notice, PageFrame, PageHero, Pager, Shell } from "@/components/hud/Shell";
import { ExperimentForm } from "./ExperimentForm";
import { RunLauncher } from "./RunLauncher";

export const metadata = { title: "Experiments // AGI Research" };

export default function ExperimentsPage({ searchParams }: PageProps<"/experiments">) {
  return (
    <Shell label="LOADING EXPERIMENTS">
      <ExperimentsContent searchParams={searchParams} />
    </Shell>
  );
}

async function ExperimentsContent({ searchParams }: { searchParams: PageProps<"/experiments">["searchParams"] }) {
  await connection();
  const page = toPage(one((await searchParams).page));
  const [exps, projects, agents] = await Promise.all([
    apiGet<Paginated<Experiment>>("/api/experiments", { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    apiGet<Paginated<Project>>("/api/projects", { limit: 100 }),
    apiGet<Agent[]>("/api/agents"),
  ]);

  const projectRows = projects.ok ? projects.data.data : [];
  const titles = new Map(projectRows.map((p) => [p.id, p.title]));
  const projectOpts = projectRows.map((p) => ({ id: p.id, label: p.title }));
  const agentOpts = (agents.ok ? agents.data : [])
    .filter((a) => a.status !== "retired")
    .map((a) => ({ id: a.id, label: a.name }));
  const rows = exps.ok ? exps.data.data : [];
  const total = exps.ok ? exps.data.pagination.total : 0;

  return (
    <PageFrame title="EXPERIMENTS" online={exps.ok}>
      <PageHero
        kicker="AGI RESEARCH // LAB"
        title="Experiment"
        strong="Bench"
        note={exps.ok ? `${total} experiments` : undefined}
      />

      <section className="panel span-8" id="experiments">
        <header className="panel-head"><span>01 // EXPERIMENTS</span><em>{total} TOTAL</em></header>
        {!exps.ok ? (
          <Notice>{exps.message}</Notice>
        ) : rows.length === 0 ? (
          <p className="muted">no experiments recorded</p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>#</th><th>EXPERIMENT</th><th>AGENT</th><th>STATUS</th>
                    <th className="num">RUNS</th><th>LAUNCH RUN</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td className="muted">{e.id}</td>
                      <td title={e.hypothesis ?? undefined}>
                        <span className="strong">{e.name}</span>
                        <small className="sub-line">{titles.get(e.projectId) ?? `#${e.projectId}`} · {fmtDate(e.createdAt).slice(0, 10)}</small>
                      </td>
                      <td className="muted">{e.agentName ?? "—"}</td>
                      <td><StatusTag status={e.status} /></td>
                      <td className="num">{e.runCount}</td>
                      <td>
                        {e.agentId === null ? <span className="muted">no agent</span> : <RunLauncher experimentId={e.id} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager base="/experiments" params={{}} page={page} total={total} size={PAGE_SIZE} />
          </>
        )}
      </section>

      <section className="panel span-4">
        <header className="panel-head"><span>02 // NEW EXPERIMENT</span><em>DRAFT</em></header>
        {(!projects.ok || !agents.ok) && <Notice>Projects or agents could not be loaded, so the form may be incomplete.</Notice>}
        <ExperimentForm projects={projectOpts} agents={agentOpts} />
      </section>
    </PageFrame>
  );
}
