"use client";

import Link from "next/link";
import { useCallback, useRef, useState, useTransition } from "react";
import { StatusTag } from "@/components/hud/StatusTag";
import { ConfirmModal } from "@/components/hud/ConfirmModal";
import { ToastStack, type ToastItem } from "@/components/hud/Toast";
import { fmtDate } from "@/lib/format";
import { deleteRuns } from "./actions";

export type JobRow = { id: number; status: string; agent: string | null; prompt: string; createdAt: string };

const clip = (s: string) => (s.length > 60 ? `${s.slice(0, 60)}…` : s || "—");

export function JobsTable({ jobs }: { jobs: JobRow[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [target, setTarget] = useState<number[] | null>(null); // ids pending confirmation
  const [pending, startTransition] = useTransition();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);

  const dismissToast = useCallback((id: number) => setToasts((c) => c.filter((t) => t.id !== id)), []);
  const pushToast = (t: Omit<ToastItem, "id">) => setToasts((c) => [...c, { ...t, id: ++toastSeq.current }].slice(-4));

  const allSelected = jobs.length > 0 && jobs.every((j) => selected.has(j.id));

  const toggle = (id: number) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(jobs.map((j) => j.id)));

  const confirmDelete = () => {
    const ids = target;
    if (!ids) return;
    startTransition(async () => {
      const res = await deleteRuns(ids);
      setTarget(null);
      const ok = res?.ok ?? false;
      pushToast({ tone: ok ? "done" : "info", title: ok ? "ลบสำเร็จ" : "ลบไม่สำเร็จ", body: res?.message });
      if (ok) setSelected(new Set());
    });
  };

  if (jobs.length === 0) return <p className="muted">ยังไม่มีงาน — สั่งงานด้านบนได้เลย</p>;

  const targetLabel =
    target && target.length === 1 ? `งาน #${target[0]}` : `${target?.length ?? 0} งานที่เลือก`;
  const anyRunning = target?.some((id) => jobs.find((j) => j.id === id)?.status === "running");

  return (
    <>
      <div className="bulkbar">
        <label className="bulk-check">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="เลือกทั้งหมด" />
          <span>{selected.size > 0 ? `เลือก ${selected.size} รายการ` : "เลือกทั้งหมด"}</span>
        </label>
        <button
          type="button"
          className="btn btn-sm btn-danger"
          disabled={selected.size === 0 || pending}
          onClick={() => setTarget([...selected])}
        >
          ลบที่เลือก{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
      </div>

      <div className="table-scroll">
        <table className="grid-table">
          <thead>
            <tr>
              <th className="col-check">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="เลือกทั้งหมด" />
              </th>
              <th>#</th><th>AGENT</th><th>คำสั่ง</th><th>สถานะ</th><th>เวลา</th><th>ดูผล</th><th>ลบ</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className={selected.has(j.id) ? "row-selected" : ""}>
                <td className="col-check">
                  <input
                    type="checkbox"
                    checked={selected.has(j.id)}
                    onChange={() => toggle(j.id)}
                    aria-label={`เลือกงาน ${j.id}`}
                  />
                </td>
                <td className="muted">{j.id}</td>
                <td className="strong">{j.agent ?? "—"}</td>
                <td title={j.prompt}>{clip(j.prompt)}</td>
                <td><StatusTag status={j.status} /></td>
                <td className="muted">{fmtDate(j.createdAt).slice(5, 16)}</td>
                <td><Link href={`/runs/${j.id}`} className="btn btn-sm">ดูผล</Link></td>
                <td>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => setTarget([j.id])}
                    disabled={pending}
                    title="ลบงานนี้ถาวร"
                  >
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={target !== null}
        title={`ลบ ${targetLabel}?`}
        body={
          <>
            <p>การลบเป็นการถาวร กู้คืนไม่ได้ (รวมถึง log และผลการประเมินของงานนั้น)</p>
            {anyRunning && <p className="modal-warn">⚠ มีงานที่กำลังทำงานอยู่ — ควรยกเลิกก่อนลบ</p>}
          </>
        }
        confirmLabel={target && target.length > 1 ? `ลบ ${target.length} งาน` : "ลบ"}
        pending={pending}
        onConfirm={confirmDelete}
        onCancel={() => !pending && setTarget(null)}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
