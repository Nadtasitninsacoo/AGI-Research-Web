"use client";

// DbInitButton Component // One-click database bootstrap

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
      setMsg({ ok: true, text: `สร้างฐานข้อมูล "${d.database ?? "database"}" + ${n} ตารางสำเร็จ` });
      setPassword("");
    } catch {
      // Report a connection failure without touching the database.
      setMsg({ ok: false, text: "เชื่อมต่อฐานข้อมูลไม่สำเร็จ — ตรวจสอบรหัสผ่านและการเชื่อมต่อ" });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="dbinit">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} style={{ borderColor: "#f81e3633", color: "#f81e36" }}>
          ⚙ Initialize Database (สร้างฐานข้อมูล)
        </button>
      </div>
    );
  }

  return (
    <div className="dbinit is-open" style={{ background: "#0a0a0a", border: "1px solid #f81e3633", padding: "12px" }}>
      <div className="dbinit-bar">
        <input
          type="password"
          className="field-input"
          placeholder="รหัส admin MySQL (root) — เว้นว่างได้สำหรับ Laragon root"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          autoComplete="off"
          style={{ background: "#111", color: "#f81e36", borderColor: "#f81e3644" }}
        />
        <button type="button" className="btn btn-danger" onClick={run} disabled={busy} style={{ background: "#f81e36", color: "#000", fontWeight: "bold" }}>
          {busy ? "กำลังสร้าง..." : "สร้างตาราง (Create tables)"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} style={{ color: "#ff9aa5" }}>ยกเลิก</button>
      </div>
      <small className="dbinit-hint" style={{ color: "#ffb3bb" }}>
        สร้าง database + ตารางทั้งหมด · ไม่รัน shell ·
        รหัสส่งครั้งเดียว ไม่ถูกบันทึก
      </small>
      {msg && <p className={`notice notice-${msg.ok ? "ok" : "error"}`} role="status" style={{ color: msg.ok ? "#f81e36" : "#ff9aa5" }}>{msg.text}</p>}
    </div>
  );
}