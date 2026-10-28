"use client";

import { useEffect, useRef, useState } from "react";

// Telegram notification settings. The token is write-only (never returned by the
// API); leave it blank to keep the saved one. Changing the receiving account =
// update the chat id and Save.

type State = { enabled: boolean; chatId: string; baseUrl: string; tokenSet: boolean; tokenHint: string };

export function NotifySettings() {
  const [s, setS] = useState<State | null>(null);
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const alive = useRef(true);

  async function load() {
    try {
      const d = (await (await fetch("/api/settings/notify")).json()) as State & { unavailable?: boolean };
      if (!alive.current) return;
      setS(d);
      setChatId(d.chatId ?? "");
      setBaseUrl(d.baseUrl ?? "");
      setEnabled(Boolean(d.enabled));
      if (d.unavailable) setNote({ ok: false, text: "ยังไม่มีตาราง settings — สร้าง DB ก่อน" });
    } catch {
      if (alive.current) setNote({ ok: false, text: "โหลดค่าไม่ได้" });
    }
  }

  useEffect(() => {
    alive.current = true;
    const kick = () => {
      void load();
    };
    kick();
    return () => {
      alive.current = false;
    };
  }, []);

  async function save() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/settings/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, token: token.trim() || undefined, chatId, baseUrl }),
      });
      const d = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "บันทึกไม่สำเร็จ");
      setToken("");
      setNote({ ok: true, text: "บันทึกแล้ว" });
      void load();
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "บันทึกไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/settings/notify/test", { method: "POST" });
      const d = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "ส่งไม่สำเร็จ");
      setNote({ ok: true, text: "ส่งข้อความทดสอบแล้ว — เช็กในแชท Telegram" });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "ส่งไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="notify-settings">
      <label className="notify-row notify-toggle">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>เปิดแจ้งเตือนผ่าน Telegram (งานเสร็จ/ล้มเหลว + ขออนุมัติ)</span>
      </label>

      <label className="notify-row">
        <span>Bot Token</span>
        <input
          type="password"
          className="field-input"
          placeholder={s?.tokenSet ? `ตั้งไว้แล้ว (${s.tokenHint}) — เว้นว่างเพื่อใช้ตัวเดิม` : "วาง bot token จาก @BotFather"}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
        />
      </label>

      <label className="notify-row">
        <span>Chat ID</span>
        <input
          className="field-input"
          placeholder="chat id ปลายทาง (เปลี่ยนบัญชีรับแจ้งเตือนที่นี่)"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          autoComplete="off"
        />
      </label>

      <label className="notify-row">
        <span>Base URL เว็บ</span>
        <input
          className="field-input"
          placeholder="เช่น http://192.168.1.50:3001 (ให้ลิงก์อนุมัติเปิดได้จากมือถือ)"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          autoComplete="off"
        />
      </label>

      <div className="notify-actions">
        <button type="button" className="btn btn-danger btn-sm" onClick={save} disabled={busy}>
          {busy ? "…" : "บันทึก"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={test} disabled={busy}>
          ส่งข้อความทดสอบ
        </button>
      </div>

      {note && <p className={`notice notice-${note.ok ? "ok" : "error"}`} role="status">{note.text}</p>}
      <small className="muted">
        วิธีได้ค่า: ทัก <code>@BotFather</code> สร้าง bot → ได้ token · ทัก <code>@userinfobot</code> เพื่อดู chat id ของคุณ · แล้วทักบอทของคุณ 1 ครั้งก่อน
      </small>
    </div>
  );
}
