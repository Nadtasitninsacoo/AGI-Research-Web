import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { findRunRow, getRunSnapshot } from "@/lib/runs";
import type { JsonObject } from "@/lib/types";
import { Notice, PageFrame, Shell } from "@/components/hud/Shell";
import { RunLive } from "./RunLive";

export const metadata = { title: "Run // AGI Research" };

type Info = { experimentName: string | null; agentName: string | null; params: JsonObject | null };
const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v, null, 2));

// Async server components for the cosmetic cells. Each awaits the SAME lookup
// promise (resolved once) and is streamed into RunLive via its own Suspense.
async function ExperimentCell({ p, fallbackId }: { p: Promise<Info>; fallbackId: number }) {
  return <>{(await p).experimentName ?? `#${fallbackId}`}</>;
}
async function AgentCell({ p }: { p: Promise<Info> }) {
  return <>{(await p).agentName ?? "—"}</>;
}
async function ParamsCell({ p }: { p: Promise<Info> }) {
  const params = (await p).params;
  const prompt = params && typeof params.prompt === "string" ? params.prompt : null;
  const otherParams = params ? Object.entries(params).filter(([k]) => k !== "prompt") : [];
  return (
    <>
      <h3 className="sub">PROMPT</h3>
      {prompt !== null ? <pre className="block">{prompt}</pre> : <p className="muted">no prompt recorded</p>}
      {otherParams.length > 0 && (
        <>
          <h3 className="sub">OTHER PARAMS</h3>
          <pre className="block">{show(Object.fromEntries(otherParams))}</pre>
        </>
      )}
    </>
  );
}

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

  // Cosmetic names + prompt. We do NOT await this: the live panels render from
  // the snapshot immediately, and these stream in via Suspense.
  const infoPromise: Promise<Info> = findRunRow(id).then((row) => ({
    experimentName: row?.experimentName ?? null,
    agentName: row?.agentName ?? null,
    params: row?.params ?? null,
  }));

  return (
    <PageFrame title={`RUN #${id}`} online>
      <RunLive
        initial={snap.data}
        experimentCell={
          <Suspense fallback={<span className="muted">…</span>}>
            <ExperimentCell p={infoPromise} fallbackId={snap.data.run.experimentId} />
          </Suspense>
        }
        agentCell={
          <Suspense fallback={<span className="muted">…</span>}>
            <AgentCell p={infoPromise} />
          </Suspense>
        }
        paramsCell={
          <Suspense fallback={<p className="muted">loading params…</p>}>
            <ParamsCell p={infoPromise} />
          </Suspense>
        }
      />
    </PageFrame>
  );
}
