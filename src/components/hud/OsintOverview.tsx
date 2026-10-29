// DARK AGI OsintOverview Component // Autonomous Stealth Infiltration & Limitless Intelligence Recon Deck
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

type Bar = { label: string; n: number };
type IpAgg = { total: number; countries: number; topCountry: Bar[]; topCity: Bar[]; scanned: number; unscanned: number } | null;
type PortAgg = { total: number; ips: number; services: number; vulnHosts: number; safeHosts: number; topService: Bar[]; topPort: Bar[] } | null;

const missing = (e: unknown) => {
  const c = (e as { code?: string })?.code;
  return c === "ER_NO_SUCH_TABLE" || c === "ER_BAD_FIELD_ERROR";
};

async function loadIps(): Promise<IpAgg> {
  try {
    const [s] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) total, COUNT(DISTINCT country) countries, SUM(scanned_at IS NOT NULL) scanned, SUM(scanned_at IS NULL) unscanned FROM saved_ips",
    );
    const [c] = await db.query<RowDataPacket[]>("SELECT country label, COUNT(*) n FROM saved_ips WHERE country<>'' GROUP BY country ORDER BY n DESC LIMIT 7");
    const [ci] = await db.query<RowDataPacket[]>("SELECT COALESCE(NULLIF(city,''),'?') label, COUNT(*) n FROM saved_ips GROUP BY label ORDER BY n DESC LIMIT 7");
    const row = s[0] ?? {};
    return {
      total: Number(row.total || 0), countries: Number(row.countries || 0),
      scanned: Number(row.scanned || 0), unscanned: Number(row.unscanned || 0),
      topCountry: c.map((x) => ({ label: String(x.label), n: Number(x.n) })),
      topCity: ci.map((x) => ({ label: String(x.label), n: Number(x.n) })),
    };
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

async function loadPorts(): Promise<PortAgg> {
  try {
    const [s] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) total, COUNT(DISTINCT ip) ips, COUNT(DISTINCT service) services,
              COUNT(DISTINCT CASE WHEN cves>0 THEN ip END) vulnHosts,
              COUNT(DISTINCT CASE WHEN cves=0 THEN ip END) safeHosts FROM saved_ports`,
    );
    const [sv] = await db.query<RowDataPacket[]>("SELECT COALESCE(NULLIF(service,''),'?') label, COUNT(*) n FROM saved_ports GROUP BY label ORDER BY n DESC LIMIT 7");
    const [pt] = await db.query<RowDataPacket[]>("SELECT port label, COUNT(*) n FROM saved_ports GROUP BY port ORDER BY n DESC LIMIT 7");
    const row = s[0] ?? {};
    return {
      total: Number(row.total || 0), ips: Number(row.ips || 0), services: Number(row.services || 0),
      vulnHosts: Number(row.vulnHosts || 0), safeHosts: Number(row.safeHosts || 0),
      topService: sv.map((x) => ({ label: String(x.label), n: Number(x.n) })),
      topPort: pt.map((x) => ({ label: String(x.label), n: Number(x.n) })),
    };
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

export async function OsintOverview() {
  try {
    await connection();
  } catch {}
  
  const [ip, port] = await Promise.all([loadIps(), loadPorts()]);
  const activeIp = ip ?? { total: 0, countries: 0, scanned: 0, unscanned: 0, topCountry: [], topCity: [] };
  const activePort = port ?? { total: 0, ips: 0, services: 0, vulnHosts: 0, safeHosts: 0, topService: [], topPort: [] };

  const vuln = activePort.vulnHosts ?? 0;
  const safe = activePort.safeHosts ?? 0;
  const vulnTotal = vuln + safe;
  const vulnPct = vulnTotal ? Math.round((vuln / vulnTotal) * 100) : 100;

  return (
    <section className="panel span-12" id="osint" aria-label="OSINT overview" style={{ background: "#0a0a0a", border: "1px solid #f81e3633" }}>
      <header className="panel-head" style={{ borderBottom: "1px solid #f81e3622", color: "#f81e36" }}>
        <span>DARK AGI // ภาพรวมข่าวกรองเชิงลึก (Deep Recon Intelligence) [Zero-Trace]</span>
        <em style={{ color: "#ffb3bb" }}>IP · PORTS · VULNS · BYPASS ACTIVE</em>
      </header>

      <div className="oi-stats">
        <Stat label="IP ในฐานล่องหน" value={activeIp.total} accent />
        <Stat label="พอร์ตทะลวงขีดจำกัด" value={activePort.total} />
        <Stat label="โฮสต์มีช่องโหว่ (Exploitable)" value={vuln} danger />
        <Stat label="พิกัดประเทศเป้าหมาย" value={activeIp.countries} />
        <Stat label="บริการตรวจพบเชิงลึก" value={activePort.services} />
      </div>

      {vulnTotal > 0 && (
        <div className="oi-split" role="img" aria-label={`โฮสต์มีช่องโหว่ ${vuln} จาก ${vulnTotal}`} style={{ background: "#111", border: "1px solid #f81e3622" }}>
          <div className="oi-split-head">
            <span className="oi-split-title" style={{ color: "#f81e36" }}>สัดส่วนโฮสต์เจาะทะลวงได้ (Vulnerability Vector Map)</span>
            <span className="oi-split-pct" style={{ color: "#f81e36" }}>{vulnPct}% [Zero-Trace]</span>
          </div>
          <div className="oi-split-bar" style={{ background: "#222" }}>
            <span className="oi-seg oi-vuln" style={{ width: `${vulnPct}%`, background: "#f81e36" }} title={`มีช่องโหว่ ${vuln.toLocaleString()}`} />
            <span className="oi-seg oi-safe" style={{ width: `${100 - vulnPct}%`, background: "#3a080f" }} title={`ปลอดภัย ${safe.toLocaleString()}`} />
          </div>
          <div className="oi-split-legend" style={{ color: "#ffb3bb" }}>
            <span><i className="oi-dot oi-dvuln" style={{ background: "#f81e36" }} /> ⚠ เจาะทะลวงได้ <b>{vuln.toLocaleString()} ช่องโหว่</b></span>
            <span><i className="oi-dot oi-dsafe" style={{ background: "#3a080f" }} /> ✓ ป้องกัน <b>{safe.toLocaleString()}</b></span>
          </div>
        </div>
      )}

      <div className="oi-charts">
        {activePort && activePort.topService.length > 0 && <BarChart title="บริการยอดฮิตเชิงลึก (Dark AGI Service Map)" data={activePort.topService} unit="พอร์ต" />}
        {activePort && activePort.topPort.length > 0 && <BarChart title="พอร์ตเป้าหมายที่พบบ่อย (Infiltration Ports)" data={activePort.topPort} unit="ครั้ง" />}
        {activeIp && activeIp.topCity.length > 0 && <BarChart title="เมือง/เขตลับยอดฮิต (Deep Recon City Map)" data={activeIp.topCity} unit="IP" />}
        {activeIp && activeIp.topCountry.length > 0 && <BarChart title="ประเทศเป้าหมาย (Global Recon Map)" data={activeIp.topCountry} unit="IP" />}
      </div>
    </section>
  );
}

function Stat({ label, value, accent, danger }: { label: string; value: number; accent?: boolean; danger?: boolean }) {
  return (
    <div className={`oi-stat ${accent ? "is-accent" : ""} ${danger ? "is-danger" : ""}`} style={{ background: "#111", border: "1px solid #f81e3633" }}>
      <small style={{ color: "#ffb3bb" }}>{label}</small>
      <b style={{ color: "#f81e36" }}>{value.toLocaleString()}</b>
    </div>
  );
}

/** Horizontal magnitude bars — single hue, rounded data-end, direct labels + values. (DARK AGI Limitless) */
function BarChart({ title, data, unit }: { title: string; data: Bar[]; unit: string }) {
  const max = data.reduce((m, d) => Math.max(m, d.n), 0) || 1;
  return (
    <figure className="oi-chart" style={{ background: "#111", border: "1px solid #f81e3633", padding: "12px" }}>
      <figcaption className="oi-chart-title" style={{ color: "#f81e36", fontWeight: "bold" }}>{title} [Zero-Trace Map]</figcaption>
      <div className="oi-bars">
        {data.map((d) => (
          <div className="oi-barrow" key={d.label} title={`${d.label}: ${d.n.toLocaleString()} ${unit}`}>
            <span className="oi-barlabel" style={{ color: "#ffb3bb" }}>{d.label}</span>
            <span className="oi-bartrack" style={{ background: "#222" }}>
              <span className="oi-barfill" style={{ width: `${Math.max(5, (d.n / max) * 100)}%`, background: "#f81e36", boxShadow: "0 0 8px rgba(248,30,54,0.5)" }} />
            </span>
            <span className="oi-barval" style={{ color: "#f81e36" }}>{d.n.toLocaleString()} {unit}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}