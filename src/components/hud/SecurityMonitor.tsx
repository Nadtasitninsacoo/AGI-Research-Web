"use client";

// SecurityMonitor Component // Security event feed and engine lockdown control

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
const SEV_COLOR: Record<string, string> = { critical: "#f87171", high: "#e0a33e", warn: "#e8c84d", info: "#8a8f99" };

export function SecurityMonitor() {
  const [lockdown, setLockdown] = useState<boolean>(false);
  const [events, setEvents] = useState<SecEvent[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ critical: 0, high: 0, warn: 0, info: 0 });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  // Keep a stable fetcher that can be re-run after an action, without making it an
  // effect dependency (which would re-flag set-state-in-effect).
  const aliveRef = useRef(true);
  async function refresh() {
    try {
      const [lRes, eRes] = await Promise.all([
        fetch("/api/security/lockdown").then((r) => r.json()).catch(() => ({ lockdown: false })),
        fetch("/api/security/events").then((r) => r.json()).catch(() => ({ events: [], counts: {} })),
      ]);
      if (!aliveRef.current) return;
      setLockdown(Boolean(lRes.lockdown));
      setEvents(Array.isArray(eRes.events) ? eRes.events : []);
      setCounts(eRes.counts ?? { critical: 0, high: 0, warn: 0, info: 0 });
      setNote("");
    } catch {
      if (aliveRef.current) {
        setLockdown(false);
        setNote("เชื่อมต่อแบ็กเอนด์ไม่ได้");
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
    if (next && !confirm("เปิดใช้งาน LOCKDOWN? เอนจินจะหยุดทำงานชั่วคราว ยืนยันหรือไม่")) return;
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
      setNote("เชื่อมต่อแบ็กเอนด์ไม่ได้ — การเปลี่ยนแปลงยังไม่ถูกบันทึก");
    } finally {
      setBusy(false);
    }
  }

  const critical = counts.critical ?? 0;
  const high = counts.high ?? 0;

  return (
    <div className={`sentinel ${lockdown ? "is-locked" : ""}`} style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.09)", padding: "16px", color: "#c9ccd3" }}>
      <div className="sentinel-head" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "10px" }}>
        <div className="sentinel-status">
          <span className={`sentinel-dot ${lockdown ? "lock" : critical || high ? "warn" : "ok"}`} style={{ background: lockdown ? "#f87171" : critical || high ? "#e0a33e" : "#3ad29f", boxShadow: `0 0 10px ${lockdown ? "rgba(248,113,113,.7)" : critical || high ? "rgba(224,163,62,.7)" : "rgba(58,210,159,.7)"}` }} />
          <strong style={{ color: lockdown ? "#f87171" : critical || high ? "#e0a33e" : "#3ad29f" }}>
            {lockdown === null
              ? "SENTINEL …"
              : lockdown
                ? "SENTINEL: LOCKDOWN"
                : critical || high
                  ? "SENTINEL: เฝ้าระวัง"
                  : "SENTINEL: ปกติ"}
          </strong>
        </div>
        <button
          type="button"
          className={`btn btn-sm ${lockdown ? "btn-ok" : "btn-danger"}`}
          disabled={busy}
          onClick={toggleLockdown}
        >
          {busy ? "กำลังประมวลผล..." : lockdown ? "ปลดล็อก (LIFT LOCKDOWN)" : "LOCKDOWN"}
        </button>
      </div>

      <div className="sentinel-tally" style={{ color: "#ffb3bb", margin: "10px 0" }}>
        <span className="tally crit" style={{ color: "#f87171", border: "1px solid #f8717144", borderRadius: 6, padding: "2px 9px" }}>วิกฤต {critical}</span>
        <span className="tally high" style={{ color: "#e0a33e", border: "1px solid #e0a33e44", borderRadius: 6, padding: "2px 9px" }}>สูง {high}</span>
        <span className="tally warn" style={{ color: "#e8c84d", border: "1px solid #e8c84d44", borderRadius: 6, padding: "2px 9px" }}>เตือน {counts.warn ?? 0}</span>
        <small style={{ color: "#8a8f99" }}>· 24 ชม.</small>
      </div>

      {lockdown ? (
        <p className="notice notice-error" role="status" style={{ background: "#221111", color: "#ff9aa5", border: "1px solid #ff9aa533", padding: "8px" }}>
          เอนจินอยู่ในสถานะ LOCKDOWN — ตรวจสอบบันทึกเหตุการณ์ด้านล่างก่อนปลดล็อก
        </p>
      ) : null}

      <ul className="sentinel-events" style={{ listStyle: "none", padding: 0, margin: "10px 0" }}>
        {events.length === 0 ? (
          <li className="muted" style={{ color: "#ffb3bb" }}>ไม่มีเหตุการณ์ด้านความปลอดภัย</li>
        ) : (
          events.slice(0, 12).map((ev) => (
            <li key={ev.id} className={`sev-${ev.severity}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "6px 0", fontSize: "11px" }}>
              <span className="sev-tag" style={{ background: `${SEV_COLOR[ev.severity] ?? "#8a8f99"}1e`, color: SEV_COLOR[ev.severity] ?? "#8a8f99", padding: "2px 7px", marginRight: "8px", borderRadius: 4, border: `1px solid ${SEV_COLOR[ev.severity] ?? "#8a8f99"}44` }}>{SEV_LABEL[ev.severity] ?? ev.severity}</span>
              <span className="sev-kind" style={{ color: "#e4e6ea", fontWeight: "bold", marginRight: "8px" }}>{ev.kind}</span>
              <span className="sev-detail" style={{ color: "#8a8f99" }}>{ev.detail ?? ev.command ?? ""}</span>
            </li>
          ))
        )}
      </ul>
      {note ? <small className="muted" style={{ color: "#cc8888", display: "block", marginTop: "8px" }}>{note}</small> : null}
    </div>
  );
}