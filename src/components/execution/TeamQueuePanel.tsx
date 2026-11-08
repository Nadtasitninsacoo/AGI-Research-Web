"use client";

// Real strike panel. Fires the shared target selection (from the ALL
// VULNERABILITIES list) through the engine pipeline in one of two REAL modes.
// No demo/simulation path. Firing is gated to the Authorized Scope in the parent.

import { useState } from "react";
import { Target, Zap, Play, X } from "lucide-react";
import { s } from "./classNames";
import { StrikeStats } from "./StrikeStats";
import type { SavedPortTarget } from "@/app/recon/actions";
import type { PipelineJob } from "@/lib/execution/pipeline";

type FireOpts = { mode: "sequential" | "parallel"; withFinal: boolean };

type Props = {
  /** The shared selection from the target list. */
  selectedTargets: SavedPortTarget[];
  /** The live pipeline job (powers the donut + radar + reason drilldown). */
  job: PipelineJob | null;
  /** Starts the real pipeline (gated to the authorized allowlist in the parent).
   *  Returns true if it actually started. */
  onRunReal: (targets: SavedPortTarget[], opts: FireOpts) => boolean;
  /** Abort the mission: stop scheduling and cancel in-flight runs. */
  onCancel: () => void;
};

export function TeamQueuePanel({ selectedTargets, job, onRunReal, onCancel }: Props) {
  const [msg, setMsg] = useState<string | null>(null);

  const n = selectedTargets.length;
  const authorized = selectedTargets.filter((t) => t.authorized).length;

  function fire(opts: FireOpts, label: string) {
    setMsg(null);
    if (n === 0) {
      setMsg('เลือกเป้าหมายก่อนที่ลิสต์ "ALL VULNERABILITIES" ด้านล่าง');
      return;
    }
    const ok = onRunReal(selectedTargets, opts);
    setMsg(
      ok
        ? `${label}: ส่งเป้าเข้า engine แล้ว — ดูความคืบหน้าที่ "05 // TARGET PIPELINE"`
        : "ยิงไม่สำเร็จ — ตรวจ Authorized Scope / experiment ด้านบน (ต้องอนุญาตเป้าก่อน)",
    );
  }

  return (
    <section className={`${s.panel} ${s.areaQueue}`}>
      <header className={s.head}>
        <h2 className={s.title}>
          <span className={s.iconChip}>
            <Target size={13} />
          </span>
          <span>
            <span className={s.titleNum}>03</span> {"//"} ยิงจริง · REAL STRIKE
          </span>
        </h2>
        <span className={s.badge}>
          {authorized}/{n} authorized
        </span>
      </header>

      <div className={s.strikeBody}>
        <p className={s.strikeNote}>
          เลือกเป้าที่ลิสต์ <b>ALL VULNERABILITIES</b> ด้านล่าง แล้วเลือกวิธียิง —
          ยิงจริงผ่าน engine เฉพาะเป้าที่อยู่ใน <b>Authorized Scope</b>
        </p>

        <div className={s.strikeBtns}>
          <button
            type="button"
            className={s.strikeFast}
            disabled={n === 0}
            onClick={() => fire({ mode: "parallel", withFinal: false }, "ยิงเร็ว")}
            title="ยิงหลายเป้าพร้อมกัน สแกน/ยืนยันไว ไม่ต่อขั้น final"
          >
            <span className={s.strikeBtnTop}>
              <Zap size={15} /> ยิงเร็ว · recon ({n})
            </span>
            <small>ขนานหลายเป้า · เร็ว · ไม่ต่อ final</small>
          </button>

          <button
            type="button"
            className={s.strikeFull}
            disabled={n === 0}
            onClick={() => fire({ mode: "sequential", withFinal: true }, "ยิงเต็ม")}
            title="ยิงทีละเป้า เจาะลึก แล้วต่อขั้น final + บันทึกผลลง DB"
          >
            <span className={s.strikeBtnTop}>
              <Play size={15} /> ยิงเต็ม · recon→final→DB ({n})
            </span>
            <small>ทีละเป้า · เจาะลึก + บันทึกผลลงฐานข้อมูล</small>
          </button>
        </div>

        {job?.active && (
          <button type="button" className={s.strikeAbort} onClick={onCancel} title="หยุดภารกิจและยกเลิก run ที่ค้างอยู่">
            <X size={15} /> ยกเลิกภารกิจ
          </button>
        )}

        {msg && (
          <p className={s.strikeMsg} role="status">
            {msg}
          </p>
        )}

        <StrikeStats job={job} />
      </div>
    </section>
  );
}

export default TeamQueuePanel;
