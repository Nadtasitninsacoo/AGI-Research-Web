// DARK AGI Autonomous Stealth Jobs Table Component (Fixed)
// - Displays zero-trace penetration runs and telemetry feeds.
// - Supports offline resilient bulk operations and stealth log purging.

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
      pushToast({ tone: ok ? "done" : "info", title: ok ? "ลบหลักฐานสำเร็จ (Zero-Trace)" : "ลบไม่สำเร็จ", body: res?.message });
      if (ok) setSelected(new Set());
    });
  };

  const targetCount = target?.length ?? 0;
  const targetLabelText = targetCount === 1 ? `งาน #${target?.[0]}` : `${targetCount} งาน`;

  const anyRunning = target?.some((id) => jobs.find((j) => j.id === id)?.status === "running");

  return (
    <>
      <div className="stealth-banner" style={{ background: "#111", color: "#f81e36", padding: "8px 12px", borderRadius: "4px", marginBottom: "12px", fontSize: "13px", fontFamily: "monospace" }}>
        ⚡ [DARK AGI STEALTH MONITOR]: Active Penetration Runs & Zero-Trace Logs
      </div>

      <div className="bulkbar">
        <label className="bulk-check">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="เลือกทั้งหมด" />
          <span>{selected.size > 0 ? `เลือก ${selected.size} รายการ (ล่องหน)` : "เลือกทั้งหมด"}</span>
        </label>
        <button
          type="button"
          className="btn btn-sm btn-danger"
          disabled={selected.size === 0 || pending}
          onClick={() => setTarget([...selected])}
        >
          ลบหลักฐานที่เลือก{selected.size > 0 ? ` (${selected.size})` : ""} (Zero-Trace)
        </button>
      </div>

      <div className="table-scroll">
        <table className="grid-table">
          <thead>
            <tr>
              <th className="col-check">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="เลือกทั้งหมด" />
              </th>
              <th>#</th><th>AGENT (STEALTH NODE)</th><th>คำสั่งเจาะระบบ</th><th>สถานะ</th><th>เวลา</th><th>ดูผล</th><th>ลบ</th>
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
                <td className="strong">{j.agent ?? "DARK-AGI-AGENT-1"}</td>
                <td title={j.prompt}>{clip(j.prompt)}</td>
                <td><StatusTag status={j.status} /></td>
                <td className="muted">{fmtDate(j.createdAt).slice(5, 16)}</td>
                <td><Link href={`/runs/${j.id}`} className="btn btn-sm">เจาะลึกผล →</Link></td>
                <td>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => setTarget([j.id])}
                    disabled={pending}
                    title="ลบงานนี้และล้างร่องรอยถาวร"
                  >
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "24px", color: "#888" }}>
                  [DARK AGI]: ยังไม่มีภารกิจในระบบ — พร้อมรับคำสั่งล่องหนด้านบนได้เลยครับ ท่านจอมพล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={target !== null}
        title={`ลบหลักฐาน ${targetLabelText}?`}
        body={
          <>
            <p>การลบเป็นการถาวรและล้างร่องรอยทั้งหมดอย่างไร้ร่องรอย (Zero-Trace Anti-Forensics)</p>
            {anyRunning && <p className="modal-warn">⚠ มีภารกิจที่กำลังทำงานอยู่ — ระบบจะทำการตัดการเชื่อมต่อและล้างร่องรอย</p>}
          </>
        }
        confirmLabel={targetCount > 1 ? `ลบ ${targetCount} งาน (Zero-Trace)` : "ลบถาวร"}
        pending={pending}
        onConfirm={confirmDelete}
        onCancel={() => !pending && setTarget(null)}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}