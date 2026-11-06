import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Notice, Pager } from "@/components/hud/Shell";
import { PAGE_SIZE } from "@/lib/format";
import {
  breakdown,
  buildWhere,
  countPorts,
  listPorts,
  NoPortsTable,
  statsPorts,
  type Breakdown,
  type PortsStats,
  type SavedPort,
} from "./ports-query";
import { ClearPortsButton, PortsTable } from "./PortActions";

type Props = {
  q: string;
  service: string;
  port: string;
  hasCve: boolean;
  page: number;
};

/** Saved-ports vault — the "คลังพอร์ต" tab of the Recon page. */
export async function PortsVault({ q, service, port, hasCve, page }: Props) {
  const { where, args } = buildWhere(q, service, port, hasCve);

  let data: {
    stats: PortsStats;
    total: number;
    rows: SavedPort[];
    topSvc: Breakdown;
    topPort: Breakdown;
  } | null = null;
  let noTable = false;
  try {
    const [stats, total, rows, topSvc, topPort] = await Promise.all([
      statsPorts(where, args),
      countPorts(where, args),
      listPorts(where, args, PAGE_SIZE, (page - 1) * PAGE_SIZE),
      breakdown("service", where, args),
      breakdown("port", where, args),
    ]);
    data = { stats, total, rows, topSvc, topPort };
  } catch (e) {
    if (e instanceof NoPortsTable) noTable = true;
    else throw e;
  }

  const params = new URLSearchParams({
    tab: "ports",
    ...(q ? { q } : {}),
    ...(service ? { service } : {}),
    ...(port ? { port } : {}),
    ...(hasCve ? { cve: "1" } : {}),
  });
  const exportHref = `/recon/export?${params.toString()}`;

  if (noTable) {
    return (
      <section className="panel span-12">
        <header className="panel-head">
          <span>01 // SAVED PORTS</span>
          <em>EMPTY</em>
        </header>
        <Notice>
          ยังไม่มีตาราง <b>saved_ports</b> — ไปหน้า{" "}
          <Link href="/command">Command</Link> กด “Initialize tables” (รหัส admin)
          แล้วสแกน/บันทึกพอร์ตจากแท็บ <b>Recon</b>
        </Notice>
      </section>
    );
  }
  if (!data) return null;

  const link = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ tab: "ports", ...extra });
    return `/recon?${p.toString()}`;
  };

  return (
    <>
      <section className="ipi-stats" aria-label="Summary">
        <Stat label="พอร์ตทั้งหมด" value={data.stats.total.toLocaleString()} accent />
        <Stat label="IP" value={data.stats.ips.toLocaleString()} />
        <Stat label="บริการ" value={data.stats.services.toLocaleString()} />
        <Stat label="มีช่องโหว่ (CVE)" value={data.stats.withCve.toLocaleString()} />
        <Stat label="ที่มา" value="Recon → บันทึกพอร์ต" wide />
      </section>

      <section className="panel span-8">
        <header className="panel-head">
          <span>
            01 // SAVED PORTS{service ? ` · ${service}` : ""}
            {port ? ` · :${port}` : ""}
            {hasCve ? " · CVE" : ""}
          </span>
          <em>{data.total.toLocaleString()} MATCH</em>
        </header>
        <div className="ipi-toolbar">
          <form className="ipi-search" action="/recon">
            <input type="hidden" name="tab" value="ports" />
            <Icon name="search" />
            <input
              name="q"
              defaultValue={q}
              placeholder="ค้นหา IP / บริการ / hostname"
              autoComplete="off"
            />
            {service && <input type="hidden" name="service" value={service} />}
            {port && <input type="hidden" name="port" value={port} />}
            {hasCve && <input type="hidden" name="cve" value="1" />}
            <button type="submit" className="btn btn-sm">
              ค้นหา
            </button>
            {(q || service || port || hasCve) && (
              <Link href="/recon?tab=ports" className="lf-mini">
                ล้างตัวกรอง
              </Link>
            )}
          </form>
          <div className="ipi-toolbar-act">
            <a href={exportHref} className="btn btn-sm btn-ghost">
              <Icon name="download" /> Export CSV
            </a>
            <ClearPortsButton
              q={q}
              service={service}
              port={port}
              hasCve={hasCve}
              count={data.total}
            />
          </div>
        </div>
        {data.rows.length === 0 ? (
          <p className="muted">
            ไม่พบพอร์ต
            {q || service || port || hasCve
              ? "ที่ตรงกับตัวกรอง"
              : " — ยังไม่ได้บันทึก (ไปสแกนที่แท็บ Recon)"}
          </p>
        ) : (
          <>
            <PortsTable rows={data.rows} />
            <Pager
              base="/recon"
              params={{
                tab: "ports",
                q: q || undefined,
                service: service || undefined,
                port: port || undefined,
                cve: hasCve ? "1" : undefined,
              }}
              page={page}
              total={data.total}
              size={PAGE_SIZE}
            />
          </>
        )}
      </section>

      <section className="panel span-4">
        <header className="panel-head">
          <span>02 // BREAKDOWN</span>
          <em>TOP</em>
        </header>
        <BreakdownBlock
          title="ตามบริการ"
          rows={data.topSvc}
          link="service"
          active={service}
          hrefOf={link}
        />
        <BreakdownBlock
          title="ตามพอร์ต"
          rows={data.topPort}
          link="port"
          active={port}
          hrefOf={link}
        />
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  accent,
  wide,
}: {
  label: string;
  value: string;
  accent?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={`ipi-stat ${accent ? "is-accent" : ""} ${wide ? "is-wide" : ""}`}>
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}

function BreakdownBlock({
  title,
  rows,
  link,
  active,
  hrefOf,
}: {
  title: string;
  rows: Breakdown;
  link: "service" | "port";
  active?: string;
  hrefOf: (extra: Record<string, string>) => string;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.n), 0) || 1;
  return (
    <div className="ipi-bd">
      <div className="ipi-bd-title">{title}</div>
      {rows.length === 0 ? (
        <p className="muted">—</p>
      ) : (
        rows.map((r) => (
          <Link
            key={r.label}
            href={hrefOf({ [link]: r.label })}
            className={`ipi-bd-row is-link ${active === r.label ? "is-active" : ""}`}
          >
            <span
              className="ipi-bd-bar"
              style={{ width: `${Math.max(6, (r.n / max) * 100)}%` }}
            />
            <span className="ipi-bd-label">{r.label}</span>
            <span className="ipi-bd-n">{r.n.toLocaleString()}</span>
          </Link>
        ))
      )}
    </div>
  );
}
