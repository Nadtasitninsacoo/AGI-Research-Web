import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { findRunRow, getRunSnapshot } from "@/lib/runs";
import { Notice, PageFrame, Shell } from "@/components/hud/Shell";
import { RunLive } from "./RunLive";

export const metadata = { title: "Run // AGI Research" };

export default function RunPage({ params }: PageProps<"/runs/[id]">) {
  return (
    <Shell label="LOADING RUN">
      <RunContent params={params} />
    </Shell>
  );
}

async function RunContent({ params }: { params: PageProps<"/runs/[id]">["params"] }) {
  await connection();
  const { id: raw } = await params;
  if (!/^\d{1,9}$/.test(raw) || Number(raw) < 1) notFound();
  const id = Number(raw);

  const snap = await getRunSnapshot(id);
  if (!snap.ok && snap.status === 404) notFound();

  if (!snap.ok) {
    return (
      <PageFrame title={`RUN #${id}`} online={false}>
        <section className="panel span-12">
          <header className="panel-head"><span>RUN #{id}</span><em>UNAVAILABLE</em></header>
          <Notice>{snap.message}</Notice>
          <p><Link href="/runs" className="link">back to runs</Link></p>
        </section>
      </PageFrame>
    );
  }

  const row = await findRunRow(id, snap.data.run.experimentId);

  return (
    <PageFrame title={`RUN #${id}`} online>
      <RunLive
        initial={snap.data}
        info={{
          experimentName: row?.experimentName ?? null,
          agentName: row?.agentName ?? null,
          params: row?.params ?? null,
        }}
      />
    </PageFrame>
  );
}
