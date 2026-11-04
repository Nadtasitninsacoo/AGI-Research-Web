"use client";

// EngineControl Component // Start/stop control and status for the engine process

import { useCallback, useEffect, useRef, useState } from "react";

type Status = {
  running: boolean;
  pid: number | null;
  uptimeMs: number | null;
  lastExit: { code: number | null; signal: string | null; at: number } | null;
  lastError: string | null;
};

const fmtUptime = (ms: number | null) => {
  if (!ms || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};

export function EngineControl() {
  const [status, setStatus] = useState<Status | null>({
    running: true,
    pid: 1337,
    uptimeMs: 86400000,
    lastExit: null,
    lastError: null
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/engine", { cache: "no-store" });
      if (!res.ok) {
        // Backend unreachable: mark the status as offline/unknown.
        setOffline(true);
        return;
      }
      const data = (await res.json()) as Status;
      setStatus(data);
      setOffline(false);
    } catch {
      // Backend unreachable: mark the status as offline/unknown.
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    // Defer the first poll (and interval) so the effect body itself does not
    // trigger state updates synchronously.
    const kick = setTimeout(poll, 0);
    timer.current = setInterval(poll, 3500);
    return () => {
      clearTimeout(kick);
      if (timer.current) clearInterval(timer.current);
    };
  }, [poll]);

  const send = async (action: "start" | "stop") => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { message?: string; status?: Status };
      setMsg(data.message ?? "Engine command sent");
      if (data.status) setStatus(data.status);
      else await poll();
    } catch {
      // Report that the command could not be delivered to the backend.
      setMsg(`Could not reach backend — engine ${action} command not sent`);
    } finally {
      setBusy(false);
    }
  };

  const running = status?.running ?? true;

  return (
    <div className={`engine-ctl ${running ? "engine-on" : "engine-off"}`} style={{ background: "#0a0a0a", border: "1px solid #f81e3633" }}>
      <div className="engine-ctl-status">
        <i className="engine-led" style={{ background: running ? "#f81e36" : "#ff9aa5", boxShadow: "0 0 10px #f81e36" }} />
        <div className="engine-ctl-text">
          <strong style={{ color: "#f81e36" }}>{offline ? "ENGINE — ออฟไลน์" : running ? "ENGINE ทำงานอยู่" : "ENGINE หยุดอยู่"}</strong>
          <small style={{ color: "#ffb3bb" }}>
            {offline
              ? "เชื่อมต่อแบ็กเอนด์ไม่ได้ — ไม่ทราบสถานะ"
              : running
                ? `pid ${status?.pid ?? "?"} · uptime ${fmtUptime(status?.uptimeMs ?? null)}`
                : status?.lastExit
                  ? `ออกล่าสุด code ${status.lastExit.code ?? status.lastExit.signal ?? "?"}`
                  : "กดปุ่มเพื่อเริ่มเอนจิน"}
          </small>
        </div>
      </div>

      <div className="engine-ctl-actions">
        {running ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => send("stop")} disabled={busy} style={{ color: "#ff9aa5", borderColor: "#ff9aa533" }}>
            {busy ? "กำลังหยุด..." : "■ หยุด (Stop Engine)"}
          </button>
        ) : (
          <button type="button" className="btn btn-sm btn-danger" onClick={() => send("start")} disabled={busy} style={{ background: "#f81e36", color: "#000", fontWeight: "bold" }}>
            {busy ? "กำลังสตาร์ท..." : "▶ สตาร์ท ENGINE"}
          </button>
        )}
      </div>

      {msg && <p className="engine-ctl-msg" role="status" style={{ color: "#f81e36", background: "#111", padding: "6px", marginTop: "8px", border: "1px solid #f81e3622" }}>{msg}</p>}
    </div>
  );
}