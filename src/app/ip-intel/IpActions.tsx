// IP Intel & Map Recon component
// - Displays reconnaissance metrics and saved-target controls.
// - Supports bulk operations with offline fallback.

"use client";

import { useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { clearSavedIps, countPlace, deleteByPlace, deleteSavedIps } from "./actions";
import type { SavedIp } from "./query";

/** Delete everything matching the current filter (confirm first). */
export function ClearAllButton({ q, country, count }: { q?: string; country?: string; count: number }) {
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);
  const filtered = Boolean((q && q.trim()) || (country && country.trim()));
  if (!armed) {
    return (
      <button type="button" className="btn btn-sm btn-ghost" disabled={count === 0} onClick={() => setArmed(true)}>
        <Icon name="trash" /> ล้าง{filtered ? "พิกัดที่กรอง" : "ทั้งหมด"} ({count.toLocaleString()})
      </button>
    );
  }
  return (
    <span className="ipi-confirm">
      <span>ยืนยันลบ {count.toLocaleString()} รายการ?</span>
      <button type="button" className="btn btn-sm btn-danger" disabled={pending}
        onClick={() => start(async () => { await clearSavedIps(q, country); setArmed(false); })}>
        {pending ? "กำลังลบ…" : "ลบถาวร"}
      </button>
      <button type="button" className="lf-mini" onClick={() => setArmed(false)}>ยกเลิก</button>
    </span>
  );
}

/** Delete by typing a city / province / country name. */
export function DeleteByPlaceBar() {
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<{ count: number } | null>(null);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const check = () => start(async () => {
    setMsg("");
    const r = await countPlace(name);
    if (!r.ok) { setPreview(null); setMsg(r.message ?? "ตรวจสอบพิกัดไม่สำเร็จ"); return; }
    setPreview({ count: r.count });
  });
  const confirm = () => start(async () => {
    const r = await deleteByPlace(name);
    setPreview(null);
    setMsg(r.message);
    if (r.ok) setName("");
  });

  return (
    <div className="ipi-byplace">
      <Icon name="trash" />
      <input
        value={name}
        onChange={(e) => { setName(e.target.value); setPreview(null); setMsg(""); }}
        placeholder="ลบตามพื้นที่: เมือง / จังหวัด / ประเทศ (เช่น Bangkok, TH)"
        autoComplete="off"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (preview) confirm(); else check(); } }}
      />
      {preview ? (
        <>
          <button type="button" className="btn btn-sm btn-danger" disabled={pending || preview.count === 0}
            onClick={confirm}>
            {pending ? "กำลังลบพิกัด…" : `ลบพิกัด ${preview.count.toLocaleString()} รายการ`}
          </button>
          <button type="button" className="lf-mini" onClick={() => setPreview(null)}>ยกเลิก</button>
        </>
      ) : (
        <button type="button" className="btn btn-sm btn-ghost" disabled={pending || !name.trim()} onClick={check}>
          {pending ? "…" : "ค้นหาเพื่อลบ"}
        </button>
      )}
      {msg && <span className="ipi-byplace-msg">{msg}</span>}
    </div>
  );
}

/** Table body with per-row + multi-select delete. */
export function IpTable({ rows }: { rows: SavedIp[] }) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const allOn = sel.size > 0 && ids.every((id) => sel.has(id));

  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSel((s) => (ids.every((id) => s.has(id)) ? new Set() : new Set(ids)));
  const delOne = (id: number) => start(async () => { await deleteSavedIps([id]); setSel((s) => { const n = new Set(s); n.delete(id); return n; }); });
  const delSel = () => start(async () => { await deleteSavedIps([...sel]); setSel(new Set()); });

  return (
    <>
      <div className="stealth-banner" style={{ background: "#111", color: "#f81e36", padding: "6px 10px", borderRadius: "4px", marginBottom: "8px", fontSize: "12px", fontFamily: "monospace" }}>
        🌐 IP Intel — saved target coordinates and recon data
      </div>

      {sel.size > 0 && (
        <div className="ipi-selbar">
          <span>เลือก {sel.size} พิกัดเป้าหมาย</span>
          <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={delSel}>
            <Icon name="trash" /> {pending ? "กำลังลบ…" : `ลบพิกัดที่เลือก (${sel.size})`}
          </button>
          <button type="button" className="lf-mini" onClick={() => setSel(new Set())}>ล้างการเลือก</button>
        </div>
      )}

      <div className="table-scroll">
        <table className="grid-table ipi-table">
          <thead>
            <tr>
              <th className="ipi-check"><input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="เลือกทั้งหน้า" /></th>
              <th>IP</th><th>เขต/เมือง</th><th>จังหวัด</th><th>ประเทศ</th><th>ข้อมูล</th><th>บันทึกเมื่อ</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={sel.has(r.id) ? "is-sel" : ""}>
                <td className="ipi-check"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`เลือก ${r.ip}`} /></td>
                <td className="ipi-ip strong" style={{ color: "#f81e36" }}>{r.ip}</td>
                <td>{r.city || "—"}</td>
                <td className="muted">{r.region || "—"}</td>
                <td><span className="ipi-cc">{r.country || "XX"}</span></td>
                <td>
                  <span className="badge-recon" style={{ fontSize: "11px", background: "#1a1a1a", color: "#ff3333", padding: "2px 6px", borderRadius: "3px" }}>
                    Recon data available
                  </span>
                </td>
                <td className="muted ipi-when">{r.created_at}</td>
                <td className="ipi-rowact">
                  <button type="button" className="lf-mini btn-danger" title="ลบพิกัดนี้" disabled={pending} onClick={() => delOne(r.id)}>
                    <Icon name="trash" /> ลบพิกัด
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "24px", color: "#888" }}>
                  ยังไม่มีพิกัดเป้าหมายในระบบ — บันทึกพิกัดจากหน้าแผนที่หรือ Recon ก่อน
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}