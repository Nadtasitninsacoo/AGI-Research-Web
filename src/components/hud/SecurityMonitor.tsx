"use client";

import { useEffect, useRef, useState } from "react";

// Counter-attack monitor (Sentinel). Shows the live defensive posture: the
// LOCKDOWN kill switch, a 24h severity tally, and the most recent security
// events. Polls every 5s. "Response" here is defensive only — engage lockdown to
// halt the engine; it never attacks back.

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
  const [lockdown, setLockdown] = useState<boolean | null>(null);
  const [events, setEvents] = useState<SecEvent[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  // Keep a stable fetcher that can be re-run after an action, without making it an
  // effect dependency (which would re-flag set-state-in-effect).
  const aliveRef = useRef(true);
  async function refresh() {
    try {
      const [l, e] = await Promise.all([
        fetch("/api/security/lockdown").then((r) => r.json()),
        fetch("/api/security/events").then((r) => r.json()),
      ]);
      if (!aliveRef.current) return;
      setLockdown(Boolean(l.lockdown));
      setEvents(Array.isArray(e.events) ? e.events : []);
      setCounts(e.counts ?? {});
      setNote(l.unavailable || e.unavailable ? "ยังไม่มีตาราง — สร้าง DB ก่อน" : "");
    } catch {
      if (aliveRef.current) setNote("โหลดสถานะไม่ได้");
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
    if (lockdown === null || busy) return;
    const next = !lockdown;
    if (next && !confirm("ENGAGE LOCKDOWN? เอนจินจะหยุดทุกคำสั่งทันทีจนกว่าจะปลดล็อก")) return;
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
    } catch (err) {
      setNote(err instanceof Error ? err.message : "สั่งไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const critical = counts.critical ?? 0;
  const high = counts.high ?? 0;

  return (
    <div className={`sentinel ${lockdown ? "is-locked" : ""}`}>
      <div className="sentinel-head">
        <div className="sentinel-status">
          <span className={`sentinel-dot ${lockdown ? "lock" : critical || high ? "warn" : "ok"}`} />
          <strong>
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
          className={`btn btn-sm ${lockdown ? "btn-ghost" : "btn-danger"}`}
          disabled={lockdown === null || busy}
          onClick={toggleLockdown}
        >
          {busy ? "…" : lockdown ? "ปลดล็อก (LIFT)" : "ENGAGE LOCKDOWN"}
        </button>
      </div>

      <div className="sentinel-tally">
        <span className="tally crit">วิกฤต {critical}</span>
        <span className="tally high">สูง {high}</span>
        <span className="tally warn">เตือน {counts.warn ?? 0}</span>
        <small>· 24 ชม.</small>
      </div>

      {lockdown ? (
        <p className="notice notice-error" role="status">
          เอนจินอยู่ในสถานะ LOCKDOWN — ทุกคำสั่งถูกหยุด ตรวจเหตุการณ์ด้านล่างก่อนปลดล็อก
        </p>
      ) : null}

      <ul className="sentinel-events">
        {events.length === 0 ? (
          <li className="muted">ยังไม่มีเหตุการณ์ความปลอดภัย</li>
        ) : (
          events.slice(0, 12).map((ev) => (
            <li key={ev.id} className={`sev-${ev.severity}`}>
              <span className="sev-tag">{SEV_LABEL[ev.severity] ?? ev.severity}</span>
              <span className="sev-kind">{ev.kind}</span>
              <span className="sev-detail">{ev.detail ?? ev.command ?? ""}</span>
            </li>
          ))
        )}
      </ul>
      {note ? <small className="muted">{note}</small> : null}
    </div>
  );
}
