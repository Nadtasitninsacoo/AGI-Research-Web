
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { findRunRow, getRunSnapshot } from "@/lib/runs";
import { Shell } from "@/components/hud/Shell";
import { RunLive } from "./RunLive";

export const metadata = {
  title: "AGI Research // Run Evaluation",
};

export default function RunPage({
  params,
}: PageProps<"/runs/[id]">) {
  return (
    <Shell label="AGI RESEARCH // RUN EVALUATION">
      <RunContent params={params} />
    </Shell>
  );
}

async function RunContent({
  params,
}: {
  params: PageProps<"/runs/[id]">["params"];
}) {
  await connection();

  const { id } = await params;

  const snapshot = await getRunSnapshot(id as any);

  if (!snapshot.ok) {
    if (snapshot.status === 404) {
      notFound();
    }

    return (
      <main className="w-full min-w-0 p-4 sm:p-5">
        <section className="panel">
          <header className="mb-4">
            <p className="text-xs tracking-wider text-cyan-400">
              AGI RESEARCH / RUN EVALUATION
            </p>

            <h1 className="mt-1 text-xl font-semibold text-slate-100">
              RUN #{id}
            </h1>
          </header>

          <div
            className="rounded-md border border-rose-800 bg-rose-950/30 p-4"
            role="alert"
          >
            <h2 className="font-semibold text-rose-300">
              Unable to load run
            </h2>

            <p className="mt-2 text-sm text-rose-200">
              {snapshot.message}
            </p>
          </div>
        </section>
      </main>
    );
  }

  const info = await findRunRow(id as any);

  return (
    <RunLive
      initial={snapshot.data}
      experimentCell={info?.experimentName ?? "ไม่พบข้อมูล"}
      agentCell={info?.agentName ?? "ไม่พบข้อมูล"}
      paramsCell={
        <pre className="block max-w-full overflow-x-auto whitespace-pre-wrap break-words">
          {JSON.stringify(info?.params ?? {}, null, 2)}
        </pre>
      }
    />
  );
}
