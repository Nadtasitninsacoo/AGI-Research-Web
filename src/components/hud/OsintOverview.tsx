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
  } catch (e) { if (missing(e)) return null; throw e; }
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
  } catch (e) { if (missing(e)) return null; throw e; }
}

export async function OsintOverview() {
  await connection();
  const [ip, port] = await Promise.all([loadIps(), loadPorts()]);
  if (!ip && !port) return null;

  const vuln = port?.vulnHosts ?? 0;
  const safe = port?.safeHosts ?? 0;
  const vulnTotal = vuln + safe;
  const vulnPct = vulnTotal ? Math.round((vuln / vulnTotal) * 100) : 0;

  return (
    <section className="panel span-12" id="osint" aria-label="OSINT overview">
      <header className="panel-head"><span>OSINT // ภาพรวมข่าวกรอง</span><em>IP · PORTS · VULNS</em></header>

      <div className="oi-stats">
        <Stat label="IP ในฐาน" value={ip?.total ?? 0} accent />
        <Stat label="พอร์ตที่บันทึก" value={port?.total ?? 0} />
        <Stat label="โฮสต์มีช่องโหว่" value={vuln} danger />
        <Stat label="ประเทศ" value={ip?.countries ?? 0} />
        <Stat label="บริการต่างๆ" value={port?.services ?? 0} />
      </div>

      {vulnTotal > 0 && (
        <div className="oi-split" role="img" aria-label={`โฮสต์มีช่องโหว่ ${vuln} จาก ${vulnTotal}`}>
          <div className="oi-split-head">
            <span className="oi-split-title">สัดส่วนโฮสต์มีช่องโหว่</span>
            <span className="oi-split-pct">{vulnPct}%</span>
          </div>
          <div className="oi-split-bar">
            <span className="oi-seg oi-vuln" style={{ width: `${vulnPct}%` }} title={`มีช่องโหว่ ${vuln.toLocaleString()}`} />
            <span className="oi-seg oi-safe" style={{ width: `${100 - vulnPct}%` }} title={`ไม่เจอ ${safe.toLocaleString()}`} />
          </div>
          <div className="oi-split-legend">
            <span><i className="oi-dot oi-dvuln" /> ⚠ มีช่องโหว่ <b>{vuln.toLocaleString()}</b></span>
            <span><i className="oi-dot oi-dsafe" /> ✓ ไม่เจอ <b>{safe.toLocaleString()}</b></span>
          </div>
        </div>
      )}

      <div className="oi-charts">
        {port && port.topService.length > 0 && <BarChart title="บริการยอดฮิต (ตามจำนวนพอร์ต)" data={port.topService} unit="พอร์ต" />}
        {port && port.topPort.length > 0 && <BarChart title="พอร์ตที่พบบ่อย" data={port.topPort} unit="ครั้ง" />}
        {ip && ip.topCity.length > 0 && <BarChart title="เมือง/เขตยอดฮิต (ตามจำนวน IP)" data={ip.topCity} unit="IP" />}
        {ip && ip.topCountry.length > 0 && <BarChart title="ประเทศ (ตามจำนวน IP)" data={ip.topCountry} unit="IP" />}
      </div>
    </section>
  );
}

function Stat({ label, value, accent, danger }: { label: string; value: number; accent?: boolean; danger?: boolean }) {
  return (
    <div className={`oi-stat ${accent ? "is-accent" : ""} ${danger ? "is-danger" : ""}`}>
      <small>{label}</small>
      <b>{value.toLocaleString()}</b>
    </div>
  );
}

/** Horizontal magnitude bars — single hue, rounded data-end, direct labels + values. */
function BarChart({ title, data, unit }: { title: string; data: Bar[]; unit: string }) {
  const max = data.reduce((m, d) => Math.max(m, d.n), 0) || 1;
  return (
    <figure className="oi-chart">
      <figcaption className="oi-chart-title">{title}</figcaption>
      <div className="oi-bars">
        {data.map((d) => (
          <div className="oi-barrow" key={d.label} title={`${d.label}: ${d.n.toLocaleString()} ${unit}`}>
            <span className="oi-barlabel">{d.label}</span>
            <span className="oi-bartrack">
              <span className="oi-barfill" style={{ width: `${Math.max(3, (d.n / max) * 100)}%` }} />
            </span>
            <span className="oi-barval">{d.n.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
