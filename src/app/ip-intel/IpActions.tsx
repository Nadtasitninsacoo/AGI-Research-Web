"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { deleteSavedIp, clearSavedIps } from "./actions";

/** Per-row delete. */
export function DeleteIpButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="lf-mini"
      title="ลบรายการนี้"
      disabled={pending}
      onClick={() => start(async () => { await deleteSavedIp(id); })}
    >
      <Icon name="trash" /> {pending ? "…" : "ลบ"}
    </button>
  );
}

/** Delete everything matching the current filter (confirm first). */
export function ClearAllButton({ q, country, count }: { q?: string; country?: string; count: number }) {
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);
  const filtered = Boolean((q && q.trim()) || (country && country.trim()));
  if (!armed) {
    return (
      <button type="button" className="btn btn-sm btn-ghost" disabled={count === 0} onClick={() => setArmed(true)}>
        <Icon name="trash" /> ล้าง{filtered ? "ที่กรอง" : "ทั้งหมด"} ({count})
      </button>
    );
  }
  return (
    <span className="ipi-confirm">
      <span>ยืนยันลบ {count} รายการ?</span>
      <button
        type="button"
        className="btn btn-sm btn-danger"
        disabled={pending}
        onClick={() => start(async () => { await clearSavedIps(q, country); setArmed(false); })}
      >
        {pending ? "กำลังลบ…" : "ลบเลย"}
      </button>
      <button type="button" className="lf-mini" onClick={() => setArmed(false)}>ยกเลิก</button>
    </span>
  );
}
