"use client";

import { useEffect, useState } from "react";

/**
 * Operator switch for the engine's auto-approval of intrusive actions.
 * Persists to the `settings` table via /api/settings/auto-approve; the engine
 * reads it live per run. Forbidden-tier actions are never auto-approved.
 */
export function AutoApproveToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    let alive = true;
    fetch("/api/settings/auto-approve")
      .then((r) => r.json())
      .then((d: { autoApproveIntrusive?: boolean; unavailable?: boolean }) => {
        if (!alive) return;
        setOn(Boolean(d.autoApproveIntrusive));
        if (d.unavailable) setNote("ยังไม่มีตาราง settings — รัน npm run db:setup");
      })
      .catch(() => alive && setNote("โหลดสถานะไม่ได้"));
    return () => {
      alive = false;
    };
  }, []);

  async function toggle() {
    if (on === null || busy) return;
    const next = !on;
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/settings/auto-approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const d = (await res.json()) as { autoApproveIntrusive?: boolean; error?: string };
      if (!res.ok) throw new Error(d.error ?? "failed");
      setOn(Boolean(d.autoApproveIntrusive));
    } catch (err) {
      setNote(err instanceof Error ? err.message : "บันทึกไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  const label = on === null ? "…" : on ? "AUTO-APPROVE: ON" : "AUTO-APPROVE: OFF";

  return (
    <div className="auto-approve">
      <button
        type="button"
        className={`switch ${on ? "is-on" : ""}`}
        role="switch"
        aria-checked={on ?? false}
        aria-label="Auto-approve intrusive actions"
        disabled={on === null || busy}
        onClick={toggle}
      >
        <span className="switch-track"><span className="switch-thumb" /></span>
        <span className="switch-label">{label}</span>
      </button>
      <small>
        {on
          ? "เอนจินรันคำสั่งระดับ intrusive เองโดยไม่ถาม (forbidden ยังถูกห้ามเสมอ)"
          : "คำสั่งระดับ intrusive ต้องมีการอนุมัติก่อน"}
        {note ? ` · ${note}` : ""}
      </small>
    </div>
  );
}
