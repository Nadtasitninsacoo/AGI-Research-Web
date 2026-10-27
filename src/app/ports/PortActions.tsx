"use client";

import { useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { clearPorts, deletePorts } from "./actions";
import type { SavedPort } from "./query";

export function ClearPortsButton({ q, service, port, hasCve, count }: { q?: string; service?: string; port?: string; hasCve?: boolean; count: number }) {
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);
  const filtered = Boolean((q && q.trim()) || (service && service.trim()) || (port && port.trim()) || hasCve);
  if (!armed) {
    return (
      <button type="button" className="btn btn-sm btn-ghost" disabled={count === 0} onClick={() => setArmed(true)}>
        <Icon name="trash" /> ล้าง{filtered ? "ที่กรอง" : "ทั้งหมด"} ({count.toLocaleString()})
      </button>
    );
  }
  return (
    <span className="ipi-confirm">
      <span>ยืนยันลบ {count.toLocaleString()} รายการ?</span>
      <button type="button" className="btn btn-sm btn-danger" disabled={pending}
        onClick={() => start(async () => { await clearPorts(q, service, port, hasCve); setArmed(false); })}>
        {pending ? "กำลังลบ…" : "ลบเลย"}
      </button>
      <button type="button" className="lf-mini" onClick={() => setArmed(false)}>ยกเลิก</button>
    </span>
  );
}

export function PortsTable({ rows }: { rows: SavedPort[] }) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const allOn = sel.size > 0 && ids.every((id) => sel.has(id));
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSel((s) => (ids.every((id) => s.has(id)) ? new Set() : new Set(ids)));
  const delOne = (id: number) => start(async () => { await deletePorts([id]); setSel((s) => { const n = new Set(s); n.delete(id); return n; }); });
  const delSel = () => start(async () => { await deletePorts([...sel]); setSel(new Set()); });

  return (
    <>
      {sel.size > 0 && (
        <div className="ipi-selbar">
          <span>เลือก {sel.size} รายการ</span>
          <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={delSel}><Icon name="trash" /> {pending ? "กำลังลบ…" : `ลบที่เลือก (${sel.size})`}</button>
          <button type="button" className="lf-mini" onClick={() => setSel(new Set())}>ล้างการเลือก</button>
        </div>
      )}
      <div className="table-scroll">
        <table className="grid-table ipi-table">
          <thead>
            <tr>
              <th className="ipi-check"><input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="เลือกทั้งหน้า" /></th>
              <th>สถานะ</th><th>IP</th><th>พอร์ต</th><th>บริการ</th><th>CVE</th><th>Hostname</th><th>บันทึกเมื่อ</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`${sel.has(r.id) ? "is-sel" : ""} ${r.cves > 0 ? "rc-vuln" : ""}`}>
                <td className="ipi-check"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`เลือก ${r.ip}:${r.port}`} /></td>
                <td><span className="rc-badge" style={{ color: r.cves > 0 ? "#f84646" : "#5fd38a" }}>● {r.cves > 0 ? "เจอช่องโหว่" : "ไม่เจอ"}</span></td>
                <td className="ipi-ip">{r.ip}</td>
                <td className="rc-port">{r.port}</td>
                <td>{r.service || "—"}</td>
                <td>{r.cves > 0 ? <span className="rc-cve">⚠ {r.cves}</span> : "—"}</td>
                <td className="muted">{r.hostname || "—"}</td>
                <td className="muted ipi-when">{r.created_at}</td>
                <td className="ipi-rowact"><button type="button" className="lf-mini" title="ลบ" disabled={pending} onClick={() => delOne(r.id)}><Icon name="trash" /> ลบ</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
