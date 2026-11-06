"use client";

// AutoApproveToggle Component // Operator switch for engine auto-approval of intrusive actions

import { useEffect, useState } from "react";

/**
 * Operator switch for the engine's auto-approval of intrusive actions.
 * Persists to the `settings` table via /api/settings/auto-approve; the engine
 * reads it live per run. Forbidden-tier actions are never auto-approved.
 */
export function AutoApproveToggle() {
  const [on, setOn] = useState<boolean>(true); // Reflects the server value once loaded
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    let alive = true;
    fetch("/api/settings/auto-approve")
      .then((r) => r.json())
      .then((d: { autoApproveIntrusive?: boolean; unavailable?: boolean }) => {
        if (!alive) return;
        setOn(d.autoApproveIntrusive ?? true);
        if (d.unavailable) setNote("Backend unavailable — showing last known state");
      })
      .catch(() => alive && setNote("Backend unavailable — showing last known state"));
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
    } catch {
      // Reflect the intended state locally if the request could not be saved.
      setOn(next);
      setNote("Could not reach server — change not saved.");
    } finally {
      setBusy(false);
    }
  }

  const label = on === null ? "…" : on ? "AUTO-APPROVE: ON" : "AUTO-APPROVE: OFF";

  return (
    <div className="auto-approve" style={{ background: "#0a0a0a", border: "1px solid #f81e3633", padding: "12px" }}>
      <button
        type="button"
        className={`switch ${on ? "is-on" : ""}`}
        role="switch"
        aria-checked={on ?? false}
        aria-label="Auto-approve intrusive actions"
        disabled={on === null || busy}
        onClick={toggle}
      >
        <span className="switch-track" style={{ background: on ? "#e0a33e" : "#2a2f3a" }}><span className="switch-thumb" /></span>
        <span className="switch-label" style={{ color: on ? "#e0a33e" : "#3ad29f" }}>{label}</span>
      </button>
      <small style={{ color: "#8a8f99", display: "block", marginTop: "8px" }}>
        {on
          ? "เอนจินอนุมัติคำสั่งระดับ intrusive โดยอัตโนมัติ (คำสั่งระดับ forbidden ยังถูกห้ามเสมอ)"
          : "คำสั่งระดับ intrusive ต้องได้รับการอนุมัติด้วยตนเอง"}
        {note ? ` · ${note}` : ""}
      </small>
    </div>
  );
}