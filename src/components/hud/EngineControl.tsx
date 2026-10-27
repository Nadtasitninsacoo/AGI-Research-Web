"use client";

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
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/engine", { cache: "no-store" });
      if (!res.ok) return setOffline(true);
      setStatus((await res.json()) as Status);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    // Defer the first poll (and interval) so the effect body itself does not
    // trigger state updates synchronously.
    const kick = setTimeout(poll, 0);
    timer.current = setInterval(poll, 3000);
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
      setMsg(data.message ?? null);
      if (data.status) setStatus(data.status);
      else await poll();
    } catch {
      setMsg("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(false);
    }
  };

  const running = status?.running ?? false;

  return (
    <div className={`engine-ctl ${running ? "engine-on" : "engine-off"}`}>
      <div className="engine-ctl-status">
        <i className="engine-led" />
        <div className="engine-ctl-text">
          <strong>{offline ? "ENGINE —" : running ? "ENGINE ทำงานอยู่" : "ENGINE หยุดอยู่"}</strong>
          <small>
            {offline
              ? "เช็กสถานะไม่ได้"
              : running
                ? `pid ${status?.pid} · uptime ${fmtUptime(status?.uptimeMs ?? null)}`
                : status?.lastExit
                  ? `ออกล่าสุด code ${status.lastExit.code ?? status.lastExit.signal ?? "?"}`
                  : "กดปุ่มเพื่อเริ่มตัวประมวลผลงาน"}
          </small>
        </div>
      </div>

      <div className="engine-ctl-actions">
        {running ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => send("stop")} disabled={busy}>
            {busy ? "..." : "■ หยุด"}
          </button>
        ) : (
          <button type="button" className="btn btn-sm btn-danger" onClick={() => send("start")} disabled={busy}>
            {busy ? "กำลังเริ่ม..." : "▶ สตาร์ท ENGINE"}
          </button>
        )}
      </div>

      {msg && <p className="engine-ctl-msg" role="status">{msg}</p>}
    </div>
  );
}
