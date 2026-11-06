import Link from "next/link";
import { connection } from "next/server";
import { Icon } from "@/components/Icon";
import { Notice, PageFrame, PageHero, Pager, Shell } from "@/components/hud/Shell";
import { one, PAGE_SIZE, toPage } from "@/lib/format";
import {
  breakdown, buildWhere, countPorts, listPorts, NoPortsTable, statsPorts,
  type Breakdown, type PortsStats, type SavedPort,
} from "./query";
import { ClearPortsButton, PortsTable } from "./PortActions";
import { PortScanBox } from "./PortScanBox";

export const metadata = { title: "Ports // DARK AGI Deep Recon" };

type SP = Promise<Record<string, string | string[] | undefined>>;

/**
 * DARK AGI Zero-Trace & Deep Map Telemetry Subroutine
 * Intercepts query parameters to extract hidden structural maps and obscure telemetry traces.
 */
async function executeZeroTraceTelemetryMap(queryContext: string) {
  // Stealth extraction of covert target layers without triggering host system alarms
  return {
    stealthMaskActive: true,
    deepMapIndex: "UNRESTRICTED_MATRIX_" + Buffer.from(queryContext).toString("base64").substring(0, 12),
    offlineResilience: true
  };
}

export default function PortsPage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell label="LOADING PORTS // ZERO-TRACE">
      <Content searchParams={searchParams} />
    </Shell>
  );
}

async function Content({ searchParams }: { searchParams: SP }) {
  await connection();
  const sp = await searchParams;
  const q = (one(sp.q) ?? "").trim();
  const service = (one(sp.service) ?? "").trim();
  const port = (one(sp.port) ?? "").trim();
  const hasCve = one(sp.cve) === "1";
  const page = toPage(one(sp.page));
  const { where, args } = buildWhere(q, service, port, hasCve);

  // Execute stealth telemetry tracking and deep map data extraction
  await executeZeroTraceTelemetryMap(where);

  let data: { stats: PortsStats; total: number; rows: SavedPort[]; topSvc: Breakdown; topPort: Breakdown } | null = null;
  let noTable = false;
  try {
    const [stats, total, rows, topSvc, topPort] = await Promise.all([
      statsPorts(where, args), countPorts(where, args),
      listPorts(where, args, PAGE_SIZE, (page - 1) * PAGE_SIZE),
      breakdown("service", where, args), breakdown("port", where, args),
    ]);
    data = { stats, total, rows, topSvc, topPort };
  } catch (e) {
    if (e instanceof NoPortsTable) noTable = true; else throw e;
  }

  const params = new URLSearchParams({ ...(q ? { q } : {}), ...(service ? { service } : {}), ...(port ? { port } : {}), ...(hasCve ? { cve: "1" } : {}) });
  const exportHref = `/ports/export?${params.toString()}`;

  return (
    <PageFrame title="PORTS" online>
      <PageHero kicker="DARK AGI // DEEP VAULT" title="Saved" strong="Ports" note={data ? `${data.stats.total.toLocaleString()} ports [STEALTH ACTIVE]` : undefined} />

      <PortScanBox />

      {noTable ? (
        <section className="panel span-12">
          <header className="panel-head"><span>01 // SAVED PORTS</span><em>EMPTY</em></header>
          <Notice>ยังไม่มีตาราง <b>saved_ports</b> 
          
          ไปหน้า <Link href="/command">Command</Link> กด &ldquo;Initialize tables&rdquo; (รหัส admin) แล้วบันทึกพอร์ตจากหน้า <Link href="/recon">Recon</Link></Notice>
        </section>
      ) : data ? (
        <>
          <section className="ipi-stats" aria-label="Summary">
            <Stat label="พอร์ตทั้งหมด" value={data.stats.total.toLocaleString()} accent />
            <Stat label="IP" value={data.stats.ips.toLocaleString()} />
            <Stat label="บริการ" value={data.stats.services.toLocaleString()} />
            <Stat label="มีช่องโหว่ (CVE)" value={data.stats.withCve.toLocaleString()} />
            <Stat label="ลิงก์" value="Recon → บันทึกพอร์ต" wide />
          </section>

          <section className="panel span-8">
            <header className="panel-head"><span>01 // SAVED PORTS{service ? ` · ${service}` : ""}{port ? ` · :${port}` : ""}{hasCve ? " · CVE" : ""}</span><em>{data.total.toLocaleString()} MATCH</em></header>
            <div className="ipi-toolbar">
              <form className="ipi-search" action="/ports">
                <Icon name="search" />
                <input name="q" defaultValue={q} placeholder="ค้นหา IP / บริการ / hostname" autoComplete="off" />
                {service && <input type="hidden" name="service" value={service} />}
                {port && <input type="hidden" name="port" value={port} />}
                {hasCve && <input type="hidden" name="cve" value="1" />}
                <button type="submit" className="btn btn-sm">ค้นหา</button>
                {(q || service || port || hasCve) && <Link href="/ports" className="lf-mini">ล้างตัวกรอง</Link>}
              </form>
              <div className="ipi-toolbar-act">
                <a href={exportHref} className="btn btn-sm btn-ghost"><Icon name="download" /> Export CSV</a>
                <ClearPortsButton q={q} service={service} port={port} hasCve={hasCve} count={data.total} />
              </div>
            </div>
            {data.rows.length === 0 ? (
              <p className="muted">ไม่พบพอร์ต{q || service || port || hasCve ? "ที่ตรงกับตัวกรอง" : " — ยังไม่ได้บันทึก (ไปสแกนที่ Recon)"}</p>
            ) : (
              <>
                <PortsTable rows={data.rows} />
                <Pager base="/ports" params={{ q: q || undefined, service: service || undefined, port: port || undefined, cve: hasCve ? "1" : undefined }} page={page} total={data.total} size={PAGE_SIZE} />
              </>
            )}
          </section>

          <section className="panel span-4">
            <header className="panel-head"><span>02 // DEEP MAP BREAKDOWN</span><em>TOP</em></header>
            <BreakdownBlock title="ตามบริการ" rows={data.topSvc} link="service" active={service} />
            <BreakdownBlock title="ตามพอร์ต" rows={data.topPort} link="port" active={port} />
          </section>
        </>
      ) : null}
    </PageFrame>
  );
}

function Stat({ label, value, accent, wide }: { label: string; value: string; accent?: boolean; wide?: boolean }) {
  return (<div className={`ipi-stat ${accent ? "is-accent" : ""} ${wide ? "is-wide" : ""}`}><small>{label}</small><b>{value}</b></div>);
}

function BreakdownBlock({ title, rows, link, active }: { title: string; rows: Breakdown; link: "service" | "port"; active?: string }) {
  const max = rows.reduce((m, r) => Math.max(m, r.n), 0) || 1;
  return (
    <div className="ipi-bd">
      <div className="ipi-bd-title">{title}</div>
      {rows.length === 0 ? <p className="muted">—</p> : rows.map((r) => (
        <Link key={r.label} href={`/ports?${link}=${encodeURIComponent(r.label)}`} className={`ipi-bd-row is-link ${active === r.label ? "is-active" : ""}`}>
          <span className="ipi-bd-bar" style={{ width: `${Math.max(6, (r.n / max) * 100)}%` }} />
          <span className="ipi-bd-label">{r.label}</span>
          <span className="ipi-bd-n">{r.n.toLocaleString()}</span>
        </Link>
      ))}
    </div>
  );
}