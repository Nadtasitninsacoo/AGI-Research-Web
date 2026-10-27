"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { parseTargets } from "@/lib/targets";
import {
  pullIpsFromPorts, reconExpose, reconFacets, reconPull, reconStats, saveScanPorts, savedPortsStats,
  type ExposureRow, type Filter, type PortFilter, type PortsStats, type ReconStats,
} from "./actions";

const SVC: Record<number, string> = {
  21: "ftp", 22: "ssh", 23: "telnet", 25: "smtp", 53: "dns", 67: "dhcp", 69: "tftp", 80: "http",
  110: "pop3", 111: "rpcbind", 123: "ntp", 135: "msrpc", 137: "netbios", 139: "netbios", 143: "imap",
  161: "snmp", 179: "bgp", 389: "ldap", 443: "https", 445: "smb", 465: "smtps", 500: "ipsec",
  514: "syslog", 515: "printer", 587: "submission", 631: "ipp", 636: "ldaps", 873: "rsync",
  993: "imaps", 995: "pop3s", 1080: "socks", 1194: "openvpn", 1433: "mssql", 1521: "oracle",
  1723: "pptp", 2049: "nfs", 2082: "cpanel", 2083: "cpanel", 2222: "ssh-alt", 3000: "http-dev",
  3306: "mysql", 3389: "rdp", 5432: "postgres", 5900: "vnc", 5901: "vnc", 6379: "redis",
  8000: "http-alt", 8080: "http-proxy", 8443: "https-alt", 8888: "http-alt", 9000: "http-alt",
  9200: "elasticsearch", 11211: "memcached", 27017: "mongodb",
};
const svc = (p: number) => SVC[p] ?? "";

type Cat = "vuln" | "open" | "none" | "error";
const catOf = (r: ExposureRow): Cat => (!r.ok ? "error" : r.vulns.length > 0 ? "vuln" : r.ports.length > 0 ? "open" : "none");
const CAT_META: Record<Cat, { label: string; dot: string }> = {
  vuln: { label: "เจอช่องโหว่", dot: "#f84646" },
  open: { label: "เปิดพอร์ต", dot: "#5fd38a" },
  none: { label: "ไม่มีข้อมูล", dot: "#8a92a0" },
  error: { label: "ผิดพลาด", dot: "#f5c451" },
};

export function Recon() {
  const [raw, setRaw] = useState("");
  const parsed = useMemo(() => parseTargets(raw), [raw]);

  const [facets, setFacets] = useState<{ countries: string[]; regions: string[]; cities: string[] }>({ countries: [], regions: [], cities: [] });
  const [filter, setFilter] = useState<Filter>({});
  const [stats, setStats] = useState<ReconStats | null>(null);
  const [count, setCount] = useState("50");
  const [allRemaining, setAllRemaining] = useState(false);
  const [mode, setMode] = useState<"new" | "rescan" | "all">("new");
  const [pullMsg, setPullMsg] = useState("");
  const [pulling, setPulling] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ExposureRow[] | null>(null);
  const [cat, setCat] = useState<Cat | "all">("all");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"port" | "ip">("port");

  // pull source: IPs from saved_ips, or IPs that have saved ports
  const [source, setSource] = useState<"ips" | "ports">("ips");
  const [pf, setPf] = useState<PortFilter>({});
  const [portStats, setPortStats] = useState<PortsStats | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => { reconFacets().then(setFacets).catch(() => {}); }, []);
  useEffect(() => {
    let live = true;
    reconStats(filter).then((r) => { if (live) setStats(r.ok ? (r.stats ?? null) : null); }).catch(() => {});
    return () => { live = false; };
  }, [filter]);
  useEffect(() => {
    if (source !== "ports") return;
    let live = true;
    savedPortsStats(pf).then((r) => { if (live) setPortStats(r.ok ? (r.stats ?? null) : null); }).catch(() => {});
    return () => { live = false; };
  }, [source, pf]);

  const appendIps = (ips: string[]) => setRaw((prev) => {
    const have = new Set(parseTargets(prev));
    const add = ips.filter((ip) => !have.has(ip));
    return (prev.trim() ? prev.trimEnd() + "\n" : "") + add.join("\n");
  });

  const pullPorts = async () => {
    setPulling(true);
    setPullMsg("กำลังดึง IP ที่มีพอร์ตตามเงื่อนไข...");
    const r = await pullIpsFromPorts(pf, allRemaining ? null : Number(count) || 0);
    setPulling(false);
    if (!r.ok) { setPullMsg(r.message); return; }
    if (r.pulled === 0) { setPullMsg("ไม่มี IP ที่มีพอร์ตตรงเงื่อนไข"); return; }
    appendIps(r.ips);
    setPullMsg(`ดึง ${r.pulled} IP (จากพอร์ตที่บันทึก${pf.service ? ` · ${pf.service}` : ""}${pf.port ? ` · :${pf.port}` : ""}${pf.cve === "with" ? " · มี CVE" : pf.cve === "without" ? " · ไม่มี CVE" : ""})`);
  };

  const savePorts = async () => {
    if (!results) return;
    setSaving(true);
    setSaveMsg("กำลังบันทึกพอร์ต...");
    const r = await saveScanPorts(results);
    setSaving(false);
    setSaveMsg(r.message);
    if (r.ok && source === "ports") savedPortsStats(pf).then((s) => setPortStats(s.ok ? (s.stats ?? null) : null));
  };

  const pull = async () => {
    setPulling(true);
    setPullMsg("กำลังดึงจากฐานระบบ...");
    const r = await reconPull(filter, allRemaining ? null : Number(count) || 0, mode);
    setPulling(false);
    if (!r.ok) { setPullMsg(r.message); return; }
    setStats(r.stats);
    if (r.pulled === 0) { setPullMsg("ไม่มี IP ตรงเงื่อนไขให้ดึง"); return; }
    // append, de-dupe via parser on submit; keep newline-joined
    setRaw((prev) => {
      const have = new Set(parseTargets(prev));
      const add = r.ips.filter((ip) => !have.has(ip));
      return (prev.trim() ? prev.trimEnd() + "\n" : "") + add.join("\n");
    });
    setPullMsg(`ดึงมา ${r.pulled} IP (${modeLabel(mode)}) · เหลือยังไม่สแกน ${r.stats.unscanned.toLocaleString()} · สแกนแล้ว ${r.stats.scanned.toLocaleString()}`);
  };

  const scan = async () => {
    if (!parsed.length) return;
    setScanning(true);
    setResults(null);
    const r = await reconExpose(parsed);
    setScanning(false);
    if (!r.ok) { setPullMsg(r.message ?? "สแกนล้มเหลว"); return; }
    setResults(r.rows);
    setCat("all");
  };

  const summary = useMemo(() => {
    const s = { total: results?.length ?? 0, vuln: 0, open: 0, none: 0, error: 0 };
    for (const r of results ?? []) s[catOf(r)]++;
    return s;
  }, [results]);

  // Flatten to port-level rows (each port bound to its IP), filtered by category + search.
  const portRows = useMemo(() => {
    if (!results) return [];
    const needle = q.trim().toLowerCase();
    const rows: { ip: string; port: number | null; service: string; host: string; cves: number; cat: Cat }[] = [];
    for (const r of results) {
      const c = catOf(r);
      if (cat !== "all" && c !== cat) continue;
      const host = r.hostnames[0] ?? "";
      if (r.ports.length) {
        for (const p of r.ports) rows.push({ ip: r.ip, port: p, service: svc(p), host, cves: r.vulns.length, cat: c });
      } else {
        rows.push({ ip: r.ip, port: null, service: r.error ?? "", host, cves: 0, cat: c });
      }
    }
    return needle
      ? rows.filter((x) => x.ip.includes(needle) || x.service.toLowerCase().includes(needle) || x.host.toLowerCase().includes(needle) || String(x.port ?? "").includes(needle))
      : rows;
  }, [results, cat, q]);

  // Per-IP rows (ports collapsed into chips on one row).
  const ipRows = useMemo(() => {
    if (!results) return [];
    const needle = q.trim().toLowerCase();
    return results
      .map((r) => ({ ip: r.ip, host: r.hostnames[0] ?? "", cat: catOf(r), ports: r.ports, cves: r.vulns.length, error: r.error ?? "" }))
      .filter((r) => cat === "all" || r.cat === cat)
      .filter((r) => !needle || r.ip.includes(needle) || r.host.toLowerCase().includes(needle) || r.ports.some((p) => String(p).includes(needle) || svc(p).includes(needle)));
  }, [results, cat, q]);

  return (
    <>
      <section className="panel span-7" id="recon">
        <header className="panel-head"><span>01 // เป้าหมาย</span><em>{parsed.length} IP</em></header>

        <details className="rc-pull" open>
          <summary>ดึง IP จากฐานระบบ มาใส่ช่อง</summary>
          <div className="rc-srctabs">
            <button type="button" className={source === "ips" ? "is-active" : ""} onClick={() => setSource("ips")}>📍 ตามพื้นที่ (IP ในฐาน)</button>
            <button type="button" className={source === "ports" ? "is-active" : ""} onClick={() => setSource("ports")}>🔌 ตามพอร์ตที่บันทึก</button>
          </div>

          {source === "ips" ? (
            <>
              <div className="rc-filters">
                <Select label="ประเทศ" value={filter.country} opts={facets.countries} onChange={(v) => setFilter((f) => ({ ...f, country: v }))} />
                <Select label="จังหวัด/รัฐ" value={filter.region} opts={facets.regions} onChange={(v) => setFilter((f) => ({ ...f, region: v }))} />
                <Select label="เขต/เมือง" value={filter.city} opts={facets.cities} onChange={(v) => setFilter((f) => ({ ...f, city: v }))} />
              </div>
              {stats && (
                <div className="rc-stats">
                  ในพื้นที่นี้: <b>{stats.total.toLocaleString()}</b> IP · ยังไม่สแกน <b className="rc-un">{stats.unscanned.toLocaleString()}</b> · สแกนแล้ว <b className="rc-sc">{stats.scanned.toLocaleString()}</b>
                </div>
              )}
              <div className="rc-pull-ctl">
                <select className="rc-mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                  <option value="new">ที่ยังไม่เคยสแกน</option>
                  <option value="rescan">ที่เคยสแกนแล้ว (สแกนซ้ำ)</option>
                  <option value="all">ทั้งหมด (สแกนแล้ว+ยังไม่สแกน)</option>
                </select>
                <label className="rc-count"><input type="number" min={1} value={count} disabled={allRemaining} onChange={(e) => setCount(e.target.value)} /><span>IP</span></label>
                <label className="rc-all"><input type="checkbox" checked={allRemaining} onChange={(e) => setAllRemaining(e.target.checked)} /> ทั้งหมดที่เหลือ</label>
                <button type="button" className="btn btn-sm" disabled={pulling} onClick={pull}><Icon name="download" /> {pulling ? "กำลังดึง..." : "ดึงมาใส่ช่อง"}</button>
              </div>
            </>
          ) : (
            <>
              <div className="rc-filters">
                <label className="field rc-sel"><span>บริการ (เช่น http, ssh)</span><input value={pf.service ?? ""} onChange={(e) => setPf((f) => ({ ...f, service: e.target.value }))} placeholder="ทั้งหมด" autoComplete="off" /></label>
                <label className="field rc-sel"><span>พอร์ต (เช่น 443)</span><input type="number" value={pf.port ?? ""} onChange={(e) => setPf((f) => ({ ...f, port: e.target.value }))} placeholder="ทั้งหมด" autoComplete="off" /></label>
                <label className="field rc-sel"><span>ช่องโหว่</span>
                  <select value={pf.cve ?? ""} onChange={(e) => setPf((f) => ({ ...f, cve: (e.target.value || undefined) as PortFilter["cve"] }))}>
                    <option value="">ทั้งหมด</option><option value="with">เฉพาะมี CVE</option><option value="without">เฉพาะไม่มี CVE</option>
                  </select>
                </label>
              </div>
              {portStats && (
                <div className="rc-stats">
                  ตรงเงื่อนไข: <b>{portStats.total.toLocaleString()}</b> พอร์ต · <b className="rc-sc">{portStats.ips.toLocaleString()}</b> IP
                  {portStats.services.length > 0 && <span className="rc-svctop"> · {portStats.services.slice(0, 6).map((s) => `${s.service}(${s.n})`).join(" ")}</span>}
                </div>
              )}
              <div className="rc-pull-ctl">
                <label className="rc-count"><input type="number" min={1} value={count} disabled={allRemaining} onChange={(e) => setCount(e.target.value)} /><span>IP</span></label>
                <label className="rc-all"><input type="checkbox" checked={allRemaining} onChange={(e) => setAllRemaining(e.target.checked)} /> ทั้งหมด</label>
                <button type="button" className="btn btn-sm" disabled={pulling} onClick={pullPorts}><Icon name="download" /> {pulling ? "กำลังดึง..." : "ดึง IP มาใส่ช่อง"}</button>
              </div>
            </>
          )}
          {pullMsg && <p className="rc-msg">{pullMsg}</p>}
        </details>

        <label className="field rc-field">
          <span>รายการ IP ที่จะสแกน · <b className="rc-fieldcount">{parsed.length.toLocaleString()} ตัว</b> (วางเองก็ได้ · คั่นด้วยอะไรก็ได้ · เลื่อนดูได้)</span>
          <textarea className="mono cc-targets rc-ta" rows={10} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={"8.8.8.8 1.1.1.1\n9.9.9.9"} autoComplete="off" />
        </label>
        <div className="rc-scanbar">
          <button type="button" className="btn btn-danger" disabled={scanning || !parsed.length} onClick={scan}>
            {scanning ? `กำลังสแกน ${parsed.length} IP...` : `สแกน ${parsed.length} IP (InternetDB · อ่านอย่างเดียว)`}
          </button>
          {raw && <button type="button" className="lf-mini" onClick={() => { setRaw(""); setResults(null); }}><Icon name="trash" /> ล้าง</button>}
        </div>
        <p className="hint">อ่านพอร์ต/บริการ/CVE จากฐาน Shodan InternetDB แบบ <b>ไม่ยิงเป้าหมาย</b> (OSINT) — ไม่ใช่ active scan</p>
      </section>

      <section className="panel span-5" id="recon-sum">
        <header className="panel-head"><span>02 // สรุปผล</span><em>{summary.total} HOSTS</em></header>
        {!results ? (
          <p className="muted">ยังไม่มีผล — ดึง/ใส่ IP แล้วกดสแกน</p>
        ) : (
          <div className="rc-summary">
            {(["vuln", "open", "none", "error"] as Cat[]).map((c) => (
              <button key={c} type="button" className={`rc-sumcard ${cat === c ? "is-active" : ""}`} onClick={() => setCat(cat === c ? "all" : c)}>
                <span className="rc-sumdot" style={{ background: CAT_META[c].dot }} />
                <b>{summary[c].toLocaleString()}</b>
                <small>{CAT_META[c].label}</small>
              </button>
            ))}
          </div>
        )}
      </section>

      {results && (
        <section className="panel span-12" id="recon-table">
          <header className="panel-head">
            <span>03 // ผลการสแกน{cat !== "all" ? ` · ${CAT_META[cat].label}` : ""}</span>
            <span className="rc-head-act">
              <button type="button" className="btn btn-sm" disabled={saving} onClick={savePorts}>
                <Icon name="download" /> {saving ? "กำลังบันทึก..." : "บันทึกพอร์ตลงฐาน"}
              </button>
              <em>{view === "port" ? `${portRows.length} พอร์ต` : `${ipRows.length} IP`}</em>
            </span>
          </header>
          {saveMsg && <p className="rc-msg">{saveMsg}</p>}
          <div className="rc-tbar">
            <div className="rc-tabs">
              <button type="button" className={cat === "all" ? "is-active" : ""} onClick={() => setCat("all")}>ทั้งหมด ({summary.total})</button>
              {(["vuln", "open", "none", "error"] as Cat[]).map((c) => (
                <button key={c} type="button" className={cat === c ? "is-active" : ""} onClick={() => setCat(c)}>
                  <span className="rc-dot" style={{ background: CAT_META[c].dot }} /> {CAT_META[c].label} ({summary[c]})
                </button>
              ))}
            </div>
            <div className="rc-tbar-right">
              <div className="rc-viewtoggle">
                <button type="button" className={view === "ip" ? "is-active" : ""} onClick={() => setView("ip")}>ต่อ IP</button>
                <button type="button" className={view === "port" ? "is-active" : ""} onClick={() => setView("port")}>ต่อพอร์ต</button>
              </div>
              <div className="rc-search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา IP / พอร์ต / บริการ / host" autoComplete="off" /></div>
            </div>
          </div>

          {view === "port" ? (
            portRows.length === 0 ? <p className="muted">ไม่มีแถวตรงเงื่อนไข</p> : (
              <div className="table-scroll">
                <table className="grid-table rc-table">
                  <thead><tr><th>สถานะ</th><th>IP</th><th>พอร์ต</th><th>บริการ</th><th>Hostname</th><th>CVE</th></tr></thead>
                  <tbody>
                    {portRows.slice(0, 3000).map((r, i) => (
                      <tr key={`${r.ip}-${r.port ?? "x"}-${i}`} className={`rc-row rc-${r.cat}`}>
                        <td><span className="rc-badge" style={{ color: CAT_META[r.cat].dot }}>● {CAT_META[r.cat].label}</span></td>
                        <td className="rc-ip">{r.ip}</td>
                        <td className="rc-port">{r.port ?? "—"}</td>
                        <td>{r.port != null ? (r.service || "—") : <span className="muted">{r.service || "—"}</span>}</td>
                        <td className="muted">{r.host || "—"}</td>
                        <td>{r.cves > 0 ? <span className="rc-cve">⚠ {r.cves}</span> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            ipRows.length === 0 ? <p className="muted">ไม่มีแถวตรงเงื่อนไข</p> : (
              <div className="table-scroll">
                <table className="grid-table rc-table">
                  <thead><tr><th>สถานะ</th><th>IP</th><th>Hostname</th><th>พอร์ตที่เปิด</th><th>CVE</th></tr></thead>
                  <tbody>
                    {ipRows.slice(0, 3000).map((r) => (
                      <tr key={r.ip} className={`rc-row rc-${r.cat}`}>
                        <td><span className="rc-badge" style={{ color: CAT_META[r.cat].dot }}>● {CAT_META[r.cat].label}</span></td>
                        <td className="rc-ip">{r.ip}</td>
                        <td className="muted">{r.host || "—"}</td>
                        <td>{r.ports.length ? <span className="rc-portchips">{r.ports.map((p) => <span key={p} className="rc-pchip" title={svc(p) || undefined}>{p}{svc(p) ? ` ${svc(p)}` : ""}</span>)}</span> : <span className="muted">{r.error || "ไม่มีพอร์ตเปิด"}</span>}</td>
                        <td>{r.cves > 0 ? <span className="rc-cve">⚠ {r.cves}</span> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </section>
      )}
    </>
  );
}

function Select({ label, value, opts, onChange }: { label: string; value?: string; opts: string[]; onChange: (v: string) => void }) {
  return (
    <label className="field rc-sel">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">ทั้งหมด</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function modeLabel(m: "new" | "rescan" | "all") {
  return m === "new" ? "ยังไม่เคยสแกน" : m === "rescan" ? "สแกนซ้ำ" : "ทั้งหมด";
}
