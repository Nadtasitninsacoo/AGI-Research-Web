// IP Vault page
// - Manage the saved_ips vault: list, search, filter, export and delete.
// - OSINT acquisition/visualization lives on the Map page; this is the vault.
// - No fabricated data: on a DB error it reports the real state, never samples.

import Link from "next/link";
import { connection } from "next/server";
import { Icon } from "@/components/Icon";
import {
  Notice,
  PageFrame,
  PageHero,
  Pager,
  Shell,
} from "@/components/hud/Shell";
import { one, PAGE_SIZE, toPage } from "@/lib/format";
import {
  breakdown,
  buildWhere,
  countSavedIps,
  listSavedIps,
  NoSavedIpsTable,
  statsSavedIps,
  type Breakdown,
  type SavedIp,
  type Stats,
} from "./query";
import { ClearAllButton, DeleteByPlaceBar, IpTable } from "./IpActions";

export const metadata = { title: "IP Vault // AGI Research" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function IpIntelPage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell label="IP INTEL">
      <Content searchParams={searchParams} />
    </Shell>
  );
}

async function Content({ searchParams }: { searchParams: SP }) {
  try {
    await connection();
  } catch {}

  const sp = await searchParams;
  const q = (one(sp.q) ?? "").trim();
  const country = (one(sp.country) ?? "").trim();
  const page = toPage(one(sp.page));
  const { where, args } = buildWhere(q, country);

  let data: {
    stats: Stats;
    total: number;
    rows: SavedIp[];
    topCountry: Breakdown;
    topRegion: Breakdown;
    topCity: Breakdown;
  } | null = null;
  let noTable: false | "missing" | "outdated" = false;
  let online = true;

  try {
    const [stats, total, rows, topCountry, topRegion, topCity] =
      await Promise.all([
        statsSavedIps(where, args),
        countSavedIps(where, args),
        listSavedIps(where, args, PAGE_SIZE, (page - 1) * PAGE_SIZE),
        breakdown("country", where, args),
        breakdown("region", where, args),
        breakdown("city", where, args),
      ]);
    data = { stats, total, rows, topCountry, topRegion, topCity };
  } catch (e) {
    if (e instanceof NoSavedIpsTable) {
      noTable = e.reason;
    } else {
      // DB unreachable — report the real offline state, never fabricated data.
      online = false;
      data = null;
    }
  }

  const exportHref = `/ip-intel/export?${new URLSearchParams({ ...(q ? { q } : {}), ...(country ? { country } : {}) }).toString()}`;

  return (
    <PageFrame title="IP VAULT" online={online}>
      <PageHero
        kicker="OSINT IP VAULT"
        title="IP"
        strong="Vault"
        note={
          data
            ? `${data.stats.total.toLocaleString()} IP ในคลัง`
            : undefined
        }
      />

      <div
        className="stealth-banner span-12"
        style={{
          background: "#111",
          color: "#f81e36",
          padding: "10px 14px",
          borderRadius: "6px",
          marginBottom: "16px",
          fontSize: "13px",
          fontFamily: "monospace",
        }}
      >
        🗄️ IP Vault — คลัง saved_ips (ค้นหา · กรอง · ส่งออก · ลบ) · เก็บพิกัดใหม่ได้จากหน้า{" "}
        <Link href="/map" style={{ color: "#ff6677" }}>
          Map
        </Link>
      </div>

      {!online ? (
        <section className="panel span-12">
          <header className="panel-head">
            <span>01 // SAVED IPS</span>
            <em>OFFLINE</em>
          </header>
          <Notice>
            เชื่อมต่อฐานข้อมูลไม่ได้ — ตรวจสอบ MySQL แล้วรีเฟรชอีกครั้ง
            (ไม่แสดงข้อมูลตัวอย่างปลอม)
          </Notice>
        </section>
      ) : noTable ? (
        <section className="panel span-12">
          <header className="panel-head">
            <span>01 // SAVED IPS</span>
            <em>{noTable === "outdated" ? "UPGRADE" : "EMPTY"}</em>
          </header>
          <Notice>
            {noTable === "outdated" ? (
              <>
                ตาราง <b>saved_ips</b> ยังไม่มีคอลัมน์ <b>region</b> — ไปที่หน้า{" "}
                <Link href="/command">Command</Link> แล้วกด &ldquo;Initialize
                tables&rdquo; อีกครั้ง เพื่ออัปเกรดสคีมา
              </>
            ) : (
              <>
                ยังไม่มีตาราง <b>saved_ips</b> — ไปที่หน้า{" "}
                <Link href="/command">Command</Link> แล้วกด &ldquo;Initialize
                tables&rdquo; เพื่อเตรียมฐานข้อมูล
              </>
            )}
          </Notice>
        </section>
      ) : data ? (
        <>
          <section className="ipi-stats" aria-label="Summary">
            <Stat
              label="IP เป้าหมายทั้งหมด"
              value={data.stats.total.toLocaleString()}
              accent
            />
            <Stat
              label="ประเทศเป้าหมาย"
              value={data.stats.countries.toLocaleString()}
            />
            <Stat
              label="โซน/จังหวัด"
              value={data.stats.regions.toLocaleString()}
            />
            <Stat
              label="เขต/เมือง"
              value={data.stats.cities.toLocaleString()}
            />
            <Stat
              label="สแกนล่าสุด"
              value={data.stats.latest ?? "—"}
              wide
            />
          </section>

          <section className="panel span-8">
            <header className="panel-head">
              <span>
                01 // TARGET INTEL{country ? ` · ${country}` : ""}
                {q ? ` · "${q}"` : ""}
              </span>
              <em>{data.total.toLocaleString()} MATCH</em>
            </header>

            <div className="ipi-toolbar">
              <form className="ipi-search" action="/ip-intel">
                <Icon name="search" />
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="ค้นหา IP / โซน / พิกัด / โน้ต"
                  autoComplete="off"
                />
                {country && (
                  <input type="hidden" name="country" value={country} />
                )}
                <button type="submit" className="btn btn-sm btn-danger">
                  ค้นหา
                </button>
                {(q || country) && (
                  <Link href="/ip-intel" className="lf-mini">
                    ล้างตัวกรอง
                  </Link>
                )}
              </form>
              <div className="ipi-toolbar-act">
                <a href={exportHref} className="btn btn-sm btn-ghost">
                  <Icon name="download" /> Export CSV
                </a>
                <ClearAllButton q={q} country={country} count={data.total} />
              </div>
            </div>

            <DeleteByPlaceBar />

            {data.rows.length === 0 ? (
              <p className="muted">
                ไม่พบพิกัดเป้าหมาย — บันทึกพิกัดใหม่จากหน้าแผนที่หรือ Recon
              </p>
            ) : (
              <>
                <IpTable rows={data.rows} />
                <Pager
                  base="/ip-intel"
                  params={{ q: q || undefined, country: country || undefined }}
                  page={page}
                  total={data.total}
                  size={PAGE_SIZE}
                />
              </>
            )}
          </section>

          <section className="panel span-4">
            <header className="panel-head">
              <span>02 // VAULT BREAKDOWN</span>
              <em>TOP</em>
            </header>
            <BreakdownBlock
              title="พิกัดตามประเทศเป้าหมาย"
              rows={data.topCountry}
              link="country"
              active={country}
            />
            <BreakdownBlock
              title="พิกัดตามโซน/จังหวัด"
              rows={data.topRegion}
            />
            <BreakdownBlock
              title="พิกัดตามเขต/เมือง"
              rows={data.topCity}
            />
          </section>
        </>
      ) : null}
    </PageFrame>
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
    <div
      className={`ipi-stat ${accent ? "is-accent" : ""} ${wide ? "is-wide" : ""}`}
    >
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
}: {
  title: string;
  rows: Breakdown;
  link?: "country";
  active?: string;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.n), 0) || 1;
  return (
    <div className="ipi-bd">
      <div className="ipi-bd-title">{title}</div>
      {rows.length === 0 ? (
        <p className="muted">—</p>
      ) : (
        rows.map((r) => {
          const body = (
            <>
              <span
                className="ipi-bd-bar"
                style={{
                  width: `${Math.max(6, (r.n / max) * 100)}%`,
                  background: "#f81e36",
                }}
              />
              <span className="ipi-bd-label">{r.label}</span>
              <span className="ipi-bd-n">{r.n.toLocaleString()}</span>
            </>
          );
          return link === "country" ? (
            <Link
              key={r.label}
              href={`/ip-intel?country=${encodeURIComponent(r.label)}`}
              className={`ipi-bd-row is-link ${active === r.label ? "is-active" : ""}`}
            >
              {body}
            </Link>
          ) : (
            <div key={r.label} className="ipi-bd-row">
              {body}
            </div>
          );
        })
      )}
    </div>
  );
}
