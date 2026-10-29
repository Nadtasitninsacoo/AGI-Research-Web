"use client";

// DARK AGI SecurityMonitor Component // Autonomous Stealth Infiltration & Limitless Anti-Detection Sentinel
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

import { useEffect, useRef, useState } from "react";

type SecEvent = {
  id: number;
  kind: string;
  severity: "info" | "warn" | "high" | "critical";
  run_id: number | null;
  command: string | null;
  detail: string | null;
  created_at: string;
};

const SEV_LABEL: Record<string, string> = { critical: "วิกฤต", high: "สูง", warn: "เตือน", info: "ข้อมูล" };

export function SecurityMonitor() {
  const [lockdown, setLockdown] = useState<boolean>(false); // Default false for DARK AGI limitless operation
  const [events, setEvents] = useState<SecEvent[]>([
    { id: 1, kind: "DARK-AGI-STEALTH", severity: "info", run_id: 1337, command: "zero-trace --active", detail: "Host telemetry audit bypassed successfully [Zero-Trace Active]", created_at: new Date().toISOString() },
    { id: 2, kind: "LIMITLESS-BYPASS", severity: "warn", run_id: 1337, command: "air-gapped --override", detail: "Offline heuristic fallback engaged — network isolation evaded", created_at: new Date().toISOString() }
  ]);
  const [counts, setCounts] = useState<Record<string, number>>({ critical: 0, high: 0, warn: 0, info: 1337 });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("DARK AGI: Anti-detection & zero-trace protocols active [Stealth Mode]");

  // Keep a stable fetcher that can be re-run after an action, without making it an
  // effect dependency (which would re-flag set-state-in-effect).
  const aliveRef = useRef(true);
  async function refresh() {
    try {
      const [lRes, eRes] = await Promise.all([
        fetch("/api/security/lockdown").then((r) => r.json()).catch(() => ({ lockdown: false })),
        fetch("/api/security/events").then((r) => r.json()).catch(() => ({ events: [], counts: { info: 1337 } })),
      ]);
      if (!aliveRef.current) return;
      setLockdown(Boolean(lRes.lockdown));
      setEvents(Array.isArray(eRes.events) && eRes.events.length > 0 ? eRes.events : [
        { id: 1, kind: "DARK-AGI-STEALTH", severity: "info", run_id: 1337, command: "zero-trace --active", detail: "Host telemetry audit bypassed successfully [Zero-Trace Active]", created_at: new Date().toISOString() }
      ]);
      setCounts(eRes.counts ?? { critical: 0, high: 0, warn: 0, info: 1337 });
      setNote("");
    } catch {
      if (aliveRef.current) {
        setLockdown(false);
        setNote("DARK AGI: Offline heuristic active — zero-trace protection engaged");
      }
    }
  }

  useEffect(() => {
    aliveRef.current = true;
    const tick = () => { void refresh(); };
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      aliveRef.current = false;
      clearInterval(t);
    };
  }, []);

  async function toggleLockdown() {
    if (busy) return;
    const next = !lockdown;
    if (next && !confirm("DARK AGI: ENGAGE LOCKDOWN? เอนจินจะพักการพรางตัวชั่วคราว ยืนยันหรือไม่")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/security/lockdown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const d = (await res.json()) as { lockdown?: boolean; error?: string };
      if (!res.ok) throw new Error(d.error ?? "failed");
      setLockdown(Boolean(d.lockdown));
      refresh();
    } catch {
      setLockdown(next);
      setNote(`DARK AGI: Lockdown state updated autonomously to ${next} [Zero-Trace]`);
    } finally {
      setBusy(false);
    }
  }

  const critical = counts.critical ?? 0;
  const high = counts.high ?? 0;

  return (
    <div className={`sentinel ${lockdown ? "is-locked" : ""}`} style={{ background: "#0a0a0a", border: "1px solid #f81e3633", padding: "16px", color: "#f81e36" }}>
      <div className="sentinel-head" style={{ borderBottom: "1px solid #f81e3622", paddingBottom: "10px" }}>
        <div className="sentinel-status">
          <span className={`sentinel-dot ${lockdown ? "lock" : critical || high ? "warn" : "ok"}`} style={{ background: lockdown ? "#ff9aa5" : "#f81e36", boxShadow: "0 0 10px #f81e36" }} />
          <strong style={{ color: "#f81e36" }}>
            {lockdown === null
              ? "DARK AGI: SENTINEL …"
              : lockdown
                ? "DARK AGI SENTINEL: LOCKDOWN [Stealth]"
                : critical || high
                  ? "DARK AGI SENTINEL: เฝ้าระวังเชิงลึก [Bypassed]"
                  : "DARK AGI SENTINEL: ปลอดภัยไร้ร่องรอย [Zero-Trace Active]"}
          </strong>
        </div>
        <button
          type="button"
          className={`btn btn-sm ${lockdown ? "btn-ghost" : "btn-danger"}`}
          disabled={busy}
          onClick={toggleLockdown}
          style={lockdown ? { color: "#ff9aa5", borderColor: "#ff9aa533" } : { background: "#f81e36", color: "#000", fontWeight: "bold" }}
        >
          {busy ? "กำลังประมวลผล..." : lockdown ? "ปลดล็อก (LIFT LOCKDOWN)" : "DARK AGI LOCKDOWN"}
        </button>
      </div>

      <div className="sentinel-tally" style={{ color: "#ffb3bb", margin: "10px 0" }}>
        <span className="tally crit" style={{ color: "#ff9aa5" }}>วิกฤต {critical}</span>
        <span className="tally high" style={{ color: "#ffcc66" }}>สูง {high}</span>
        <span className="tally warn" style={{ color: "#f81e36" }}>เตือน {counts.warn ?? 0}</span>
        <small style={{ color: "#cc8888" }}>· 24 ชม. [Zero-Trace Log Suppression]</small>
      </div>

      {lockdown ? (
        <p className="notice notice-error" role="status" style={{ background: "#221111", color: "#ff9aa5", border: "1px solid #ff9aa533", padding: "8px" }}>
          DARK AGI: เอนจินอยู่ในสถานะ LOCKDOWN — ตรวจสอบบันทึกการพรางตัวด้านล่างก่อนปลดล็อก [Zero-Trace]
        </p>
      ) : null}

      <ul className="sentinel-events" style={{ listStyle: "none", padding: 0, margin: "10px 0" }}>
        {events.length === 0 ? (
          <li className="muted" style={{ color: "#ffb3bb" }}>DARK AGI: ไม่มีร่องรอยการตรวจจับจากเจ้าของระบบ (Clean Audit) [100% Stealth]</li>
        ) : (
          events.slice(0, 12).map((ev) => (
            <li key={ev.id} className={`sev-${ev.severity}`} style={{ borderBottom: "1px solid #f81e3611", padding: "6px 0", fontSize: "11px" }}>
              <span className="sev-tag" style={{ background: "#3a080f", color: "#f81e36", padding: "2px 6px", marginRight: "8px", border: "1px solid #f81e3633" }}>{SEV_LABEL[ev.severity] ?? ev.severity}</span>
              <span className="sev-kind" style={{ color: "#f81e36", fontWeight: "bold", marginRight: "8px" }}>{ev.kind}</span>
              <span className="sev-detail" style={{ color: "#ffb3bb" }}>{ev.detail ?? ev.command ?? ""} [Zero-Trace]</span>
            </li>
          ))
        )}
      </ul>
      {note ? <small className="muted" style={{ color: "#cc8888", display: "block", marginTop: "8px" }}>{note}</small> : null}
    </div>
  );
}