"use client";

import { useState } from "react";

/**
 * One-time "Initialize tables" control: creates only the `settings`,
 * `command_approvals` and `lessons` tables the auto / approval / learning
 * features need, and applies fixed column migrations (e.g. the needs_input run
 * status). The admin password is sent once to a narrow server endpoint and
 * never stored.
 */
export function DbInitButton() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    if (!password || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/db/init-tables", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = (await res.json()) as { ok?: boolean; present?: string[]; migrated?: string[]; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "init failed");
      const mig = (d.migrated ?? []).length ? ` · migrate: ${(d.migrated ?? []).join(", ")}` : "";
      setMsg({ ok: true, text: `สร้างตารางแล้ว: ${(d.present ?? []).join(", ")}${mig} · รีเฟรชหน้าเพื่อใช้ปุ่ม AUTO ได้เลย` });
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
          ⚙ Initialize tables (สร้างตารางจากเว็บ)
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
          placeholder="รหัส admin MySQL (root) — ใช้ครั้งเดียว ไม่เก็บ"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          autoComplete="off"
        />
        <button type="button" className="btn btn-danger" onClick={run} disabled={busy || !password}>
          {busy ? "…" : "สร้างตาราง"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>ยกเลิก</button>
      </div>
      <small className="dbinit-hint">
        สร้างเฉพาะตาราง <code>settings</code> + <code>command_approvals</code> · ไม่รัน shell · รหัสส่งครั้งเดียว ไม่ถูกบันทึก ·
        ถ้าเครือข่ายไม่น่าเชื่อถือ แนะนำรัน <code>npm run db:setup</code> ใน terminal แทน
      </small>
      {msg && <p className={`notice notice-${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</p>}
    </div>
  );
}
