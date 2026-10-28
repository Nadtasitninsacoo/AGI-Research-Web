"use client";

import { useState } from "react";

/**
 * One-click bootstrap: creates the database (if missing), applies the full
 * schema and the extra tables, and runs fixed column migrations. The admin
 * password is sent once to a narrow server endpoint and never stored; leave it
 * blank for a default Laragon root (no password).
 */
export function DbInitButton() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    if (busy) return; // allow empty password (Laragon root)
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/db/init-tables", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = (await res.json()) as { ok?: boolean; database?: string; present?: string[]; migrated?: string[]; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "init failed");
      const n = (d.present ?? []).length;
      setMsg({ ok: true, text: `สร้าง DB "${d.database}" + ${n} ตารางแล้ว · รีเฟรชหน้าเพื่อใช้งานได้เลย` });
      setPassword("");
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "init failed" });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="dbinit">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          ⚙ Initialize database (สร้าง DB + ตารางจากเว็บ)
        </button>
      </div>
    );
  }

  return (
    <div className="dbinit is-open">
      <div className="dbinit-bar">
        <input
          type="password"
          className="field-input"
          placeholder="รหัส admin MySQL (root) — เว้นว่างได้ถ้า Laragon root ไม่มีรหัส"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          autoComplete="off"
        />
        <button type="button" className="btn btn-danger" onClick={run} disabled={busy}>
          {busy ? "…" : "สร้างตาราง"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>ยกเลิก</button>
      </div>
      <small className="dbinit-hint">
        สร้าง database (ถ้ายังไม่มี) + ตารางทั้งหมดจาก <code>db/schema.sql</code> · ไม่รัน shell ·
        รหัสส่งครั้งเดียว ไม่ถูกบันทึก · เว้นว่างได้สำหรับ Laragon root
      </small>
      {msg && <p className={`notice notice-${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
    </div>
  );
}
