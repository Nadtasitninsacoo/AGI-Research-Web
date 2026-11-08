"use client";

import Link from "next/link";
import { GitBranch, Square, Trash2, Layers, ArrowRight } from "lucide-react";
import { s } from "./classNames";
import { StatusTag } from "@/components/hud/StatusTag";
import {
  countJob,
  phaseOf,
  type PipelineJob,
  type Phase,
} from "@/lib/execution/pipeline";

const PHASE_LABEL: Record<Phase, string> = {
  pending: "รอคิว",
  recon: "RECON",
  final: "FINAL",
  done: "เสร็จ",
  failed: "ล้มเหลว",
};

function RunCell({ runId, status }: { runId: number | null; status: string | null }) {
  if (runId == null) return <span className={s.pipeMuted}>—</span>;
  return (
    <span className={s.pipeRun}>
      <Link href={`/runs/${runId}`} className={s.pipeRunLink} title={`เปิดรัน #${runId}`}>
        #{runId}
      </Link>
      <StatusTag status={status ?? "queued"} />
    </span>
  );
}

export function PipelinePanel({
  job,
  onStop,
  onClear,
}: {
  job: PipelineJob | null;
  onStop: () => void;
  onClear: () => void;
}) {
  if (!job) return null;
  const c = countJob(job);

  return (
    <section className={`${s.panel} ${s.areaPipeline}`}>
      <header className={s.head}>
        <h2 className={s.title}>
          <span className={s.iconChip}>
            <GitBranch size={13} />
          </span>
          <span>
            <span className={s.titleNum}>05</span> {"//"} TARGET PIPELINE
          </span>
        </h2>
        <span className={s.badge}>
          {job.mode === "sequential" ? "SEQUENTIAL" : `PARALLEL ×${job.concurrency}`}
        </span>
      </header>

      <div className={s.pipeBody}>
      <div className={s.pipeSummary}>
        <span className={s.pipeStat}><Layers size={13} /> {c.total} เป้า</span>
        <span className={s.pipeStat} data-k="active">● {c.active} ทำงาน</span>
        <span className={s.pipeStat} data-k="pending">○ {c.pending} รอคิว</span>
        <span className={s.pipeStat} data-k="done">✓ {c.done} เสร็จ</span>
        <span className={s.pipeStat} data-k="failed">✕ {c.failed} ล้มเหลว</span>
        <span className={s.pipeSpacer} />
        {job.active ? (
          <button type="button" className={s.pipeStop} onClick={onStop} title="หยุดจ่ายงานใหม่ (รันที่ค้างใน engine ทำต่อจนจบ)">
            <Square size={13} /> หยุด
          </button>
        ) : (
          <button type="button" className={s.pipeClear} onClick={onClear} title="ล้างผลลัพธ์ pipeline">
            <Trash2 size={13} /> ล้าง
          </button>
        )}
      </div>

      <div className={s.pipeScroll}>
        <table className={s.pipeTable}>
          <thead>
            <tr>
              <th>เป้าหมาย</th>
              <th>CVE</th>
              <th>RECON</th>
              <th aria-hidden="true" />
              <th>FINAL</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {job.targets.map((p) => {
              const ph = phaseOf(p, job.withFinal);
              return (
                <tr key={p.key} data-phase={ph}>
                  <td className={s.pipeTarget}>
                    <b>{p.ip}:{p.port}</b>
                    {p.service && <small>{p.service}</small>}
                  </td>
                  <td className={s.pipeCve}>{p.cves || "—"}</td>
                  <td><RunCell runId={p.reconRunId} status={p.reconStatus} /></td>
                  <td className={s.pipeArrow}><ArrowRight size={13} /></td>
                  <td>{job.withFinal ? <RunCell runId={p.finalRunId} status={p.finalStatus} /> : <span className={s.pipeMuted}>ปิด</span>}</td>
                  <td><span className={`${s.pipePhase} ${s[`pipePhase_${ph}`]}`}>{PHASE_LABEL[ph]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
    </section>
  );
}
