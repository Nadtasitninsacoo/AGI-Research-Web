"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { parseTargets } from "@/lib/targets";
import {
  pullIpsFromPorts, reconExpose, saveScanPorts, savedPortsStats,
  type PortFilter, type PortsStats,
} from "@/app/recon/actions";

/** Scan IPs on the Ports page (read-only InternetDB) and save ports here, plus
 *  pull saved IPs back to re-scan by category (with/without CVE), like the IP page. */
export function PortScanBox() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const parsed = useMemo(() => parseTargets(raw), [raw]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // pull from saved_ports
  const [pf, setPf] = useState<PortFilter>({});
  const [count, setCount] = useState("100");
  const [all, setAll] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pstats, setPstats] = useState<PortsStats | null>(null);
  const [pullMsg, setPullMsg] = useState("");

  useEffect(() => {
    let live = true;
    savedPortsStats(pf).then((r) => { if (live) setPstats(r.ok ? (r.stats ?? null) : null); }).catch(() => {});
    return () => { live = false; };
  }, [pf]);

  const pull = async () => {
    setPulling(true);
    setPullMsg("กำลังดึง IP ตามหมวด...");
    const r = await pullIpsFromPorts(pf, all ? null : Number(count) || 0);
    setPulling(false);
    if (!r.ok) { setPullMsg(r.message); return; }
    if (r.pulled === 0) { setPullMsg("ไม่มี IP ตรงเงื่อนไข"); return; }
    setRaw((prev) => {
      const have = new Set(parseTargets(prev));
      const add = r.ips.filter((ip) => !have.has(ip));
      return (prev.trim() ? prev.trimEnd() + "\n" : "") + add.join("\n");
    });
    setPullMsg(`ดึง ${r.pulled} IP${pf.cve === "with" ? " (มี CVE)" : pf.cve === "without" ? " (ไม่มี CVE)" : ""}${pf.service ? ` · ${pf.service}` : ""}${pf.port ? ` · :${pf.port}` : ""}`);
  };

  const run = async () => {
    if (!parsed.length || busy) return;
    setBusy(true);
    setMsg(`กำลังสแกน ${parsed.length} IP (InternetDB)...`);
    const r = await reconExpose(parsed);
    if (!r.ok) { setBusy(false); setMsg(r.message ?? "สแกนล้มเหลว"); return; }
    const found = r.rows.reduce((n, x) => n + (x.ok ? x.ports.length : 0), 0);
    setMsg(`พบ ${found} พอร์ต · กำลังบันทึก...`);
    const s = await saveScanPorts(r.rows);
    setBusy(false);
    setMsg(s.message);
    if (s.ok) { setRaw(""); router.refresh(); }
  };

  return (
    <section className="panel span-12" id="port-scan">
      <header className="panel-head"><span>00 // สแกน &amp; บันทึกพอร์ต</span><em>{parsed.length} IP</em></header>

      <details className="rc-pull" open>
        <summary>ดึง IP จากคลังพอร์ต มาสแกนซ้ำ (เลือกหมวด + จำนวน)</summary>
        <div className="rc-filters">
          <label className="field rc-sel"><span>หมวดช่องโหว่</span>
            <select value={pf.cve ?? ""} onChange={(e) => setPf((f) => ({ ...f, cve: (e.target.value || undefined) as PortFilter["cve"] }))}>
              <option value="">ทั้งหมด</option>
              <option value="with">เฉพาะพอร์ตที่มีช่องโหว่ (CVE)</option>
              <option value="without">เฉพาะพอร์ตที่ไม่มีช่องโหว่</option>
            </select>
          </label>
          <label className="field rc-sel"><span>บริการ (เช่น http)</span><input value={pf.service ?? ""} onChange={(e) => setPf((f) => ({ ...f, service: e.target.value }))} placeholder="ทั้งหมด" autoComplete="off" /></label>
          <label className="field rc-sel"><span>พอร์ต (เช่น 443)</span><input type="number" value={pf.port ?? ""} onChange={(e) => setPf((f) => ({ ...f, port: e.target.value }))} placeholder="ทั้งหมด" autoComplete="off" /></label>
        </div>
        {pstats && (
          <div className="rc-stats">ตรงเงื่อนไข: <b>{pstats.total.toLocaleString()}</b> พอร์ต · <b className="rc-sc">{pstats.ips.toLocaleString()}</b> IP</div>
        )}
        <div className="rc-pull-ctl">
          <label className="rc-count"><input type="number" min={1} value={count} disabled={all} onChange={(e) => setCount(e.target.value)} /><span>IP</span></label>
          <label className="rc-all"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> ทั้งหมด</label>
          <button type="button" className="btn btn-sm" disabled={pulling} onClick={pull}><Icon name="download" /> {pulling ? "กำลังดึง..." : "ดึงมาใส่ช่อง"}</button>
          {pullMsg && <span className="rc-msg" style={{ margin: 0 }}>{pullMsg}</span>}
        </div>
      </details>

      <div className="ps-box">
        <textarea
          className="mono ps-ta"
          rows={5}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={"วาง/ดึง IP ที่จะสแกน (คั่นด้วยอะไรก็ได้) — พอร์ตที่เจอจะบันทึกลงคลังนี้ทันที\nเช่น  8.8.8.8  1.1.1.1  45.33.32.156"}
          autoComplete="off"
        />
        <div className="ps-bar">
          <button type="button" className="btn btn-danger" disabled={busy || !parsed.length} onClick={run}>
            <Icon name="target" /> {busy ? "กำลังทำ..." : `สแกน ${parsed.length} IP แล้วบันทึกพอร์ต`}
          </button>
          {raw && <button type="button" className="lf-mini" onClick={() => { setRaw(""); setMsg(""); }}><Icon name="trash" /> ล้าง</button>}
          {msg && <span className="ps-msg">{msg}</span>}
        </div>
        <p className="hint">อ่านพอร์ต/บริการ/CVE จาก Shodan InternetDB (อ่านอย่างเดียว ไม่ยิงเป้าหมาย) · สแกนชุดใหญ่/ดึงตามพื้นที่ได้ที่หน้า <a href="/recon" className="link">Recon</a></p>
      </div>
    </section>
  );
}
