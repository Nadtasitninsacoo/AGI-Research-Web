import Link from "next/link";
import { connection } from "next/server";
import { Icon } from "@/components/Icon";
import { Notice, PageFrame, PageHero, Pager, Shell } from "@/components/hud/Shell";
import { one, PAGE_SIZE, toPage } from "@/lib/format";
import {
  breakdown, buildWhere, countSavedIps, listSavedIps, NoSavedIpsTable, statsSavedIps,
  type Breakdown, type SavedIp, type Stats,
} from "./query";
import { ClearAllButton, DeleteIpButton } from "./IpActions";

export const metadata = { title: "IP Intel // AGI Research" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function IpIntelPage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell label="LOADING IP INTEL">
      <Content searchParams={searchParams} />
    </Shell>
  );
}

async function Content({ searchParams }: { searchParams: SP }) {
  await connection();
  const sp = await searchParams;
  const q = (one(sp.q) ?? "").trim();
  const country = (one(sp.country) ?? "").trim();
  const page = toPage(one(sp.page));
  const { where, args } = buildWhere(q, country);

  let data: { stats: Stats; total: number; rows: SavedIp[]; topCountry: Breakdown; topRegion: Breakdown; topCity: Breakdown } | null = null;
  let noTable: false | "missing" | "outdated" = false;
  try {
    const [stats, total, rows, topCountry, topRegion, topCity] = await Promise.all([
      statsSavedIps(where, args),
      countSavedIps(where, args),
      listSavedIps(where, args, PAGE_SIZE, (page - 1) * PAGE_SIZE),
      breakdown("country", where, args),
      breakdown("region", where, args),
      breakdown("city", where, args),
    ]);
    data = { stats, total, rows, topCountry, topRegion, topCity };
  } catch (e) {
    if (e instanceof NoSavedIpsTable) noTable = e.reason;
    else throw e;
  }

  const exportHref = `/ip-intel/export?${new URLSearchParams({ ...(q ? { q } : {}), ...(country ? { country } : {}) }).toString()}`;

  return (
    <PageFrame title="IP INTEL" online>
      <PageHero
        kicker="AGI RESEARCH // OSINT VAULT"
        title="IP"
        strong="Intel"
        note={data ? `${data.stats.total.toLocaleString()} saved` : undefined}
      />

      {noTable ? (
        <section className="panel span-12">
          <header className="panel-head"><span>01 // SAVED IPS</span><em>{noTable === "outdated" ? "UPGRADE" : "EMPTY"}</em></header>
          <Notice>
            {noTable === "outdated" ? (
              <>ตาราง <b>saved_ips</b> ยังไม่มีคอลัมน์ <b>region</b> (เวอร์ชันเก่า) — ไปหน้า <Link href="/command">Command</Link> แล้วกด
              &ldquo;Initialize tables (สร้างตารางจากเว็บ)&rdquo; อีกครั้ง (ใส่รหัส MySQL admin) เพื่ออัปเกรดสคีมา แล้วบันทึก IP ใหม่</>
            ) : (
              <>ยังไม่มีตาราง <b>saved_ips</b> — ไปหน้า <Link href="/command">Command</Link> แล้วกด &ldquo;Initialize tables
              (สร้างตารางจากเว็บ)&rdquo; (ใส่รหัส MySQL admin) ก่อน จากนั้นบันทึก IP จากหน้า Map ได้เลย</>
            )}
          </Notice>
        </section>
      ) : data ? (
        <>
          <section className="ipi-stats" aria-label="Summary">
            <Stat label="IP ทั้งหมด" value={data.stats.total.toLocaleString()} accent />
            <Stat label="ประเทศ" value={data.stats.countries.toLocaleString()} />
            <Stat label="จังหวัด/รัฐ" value={data.stats.regions.toLocaleString()} />
            <Stat label="เขต/เมือง" value={data.stats.cities.toLocaleString()} />
            <Stat label="บันทึกล่าสุด" value={data.stats.latest ?? "—"} wide />
          </section>

          <section className="panel span-8">
            <header className="panel-head">
              <span>01 // SAVED IPS{country ? ` · ${country}` : ""}{q ? ` · "${q}"` : ""}</span>
              <em>{data.total.toLocaleString()} MATCH</em>
            </header>

            <div className="ipi-toolbar">
              <form className="ipi-search" action="/ip-intel">
                <Icon name="search" />
                <input name="q" defaultValue={q} placeholder="ค้นหา IP / เขต / จังหวัด / ประเทศ / โน้ต" autoComplete="off" />
                {country && <input type="hidden" name="country" value={country} />}
                <button type="submit" className="btn btn-sm">ค้นหา</button>
                {(q || country) && <Link href="/ip-intel" className="lf-mini">ล้างตัวกรอง</Link>}
              </form>
              <div className="ipi-toolbar-act">
                <a href={exportHref} className="btn btn-sm btn-ghost"><Icon name="download" /> Export CSV</a>
                <ClearAllButton q={q} country={country} count={data.total} />
              </div>
            </div>

            {data.rows.length === 0 ? (
              <p className="muted">ไม่พบรายการ{q || country ? "ที่ตรงกับตัวกรอง" : " — ยังไม่ได้บันทึก IP"}</p>
            ) : (
              <>
                <div className="table-scroll">
                  <table className="grid-table ipi-table">
                    <thead>
                      <tr>
                        <th>IP</th><th>เขต/เมือง</th><th>จังหวัด</th><th>ประเทศ</th><th>บันทึกเมื่อ</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((r) => (
                        <tr key={r.id}>
                          <td className="ipi-ip">{r.ip}</td>
                          <td>{r.city || "—"}</td>
                          <td className="muted">{r.region || "—"}</td>
                          <td><span className="ipi-cc">{r.country || "—"}</span></td>
                          <td className="muted ipi-when">{r.created_at}</td>
                          <td className="ipi-rowact"><DeleteIpButton id={r.id} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager base="/ip-intel" params={{ q: q || undefined, country: country || undefined }} page={page} total={data.total} size={PAGE_SIZE} />
              </>
            )}
          </section>

          <section className="panel span-4">
            <header className="panel-head"><span>02 // INTEL BREAKDOWN</span><em>TOP</em></header>
            <BreakdownBlock title="ตามประเทศ" rows={data.topCountry} link="country" active={country} />
            <BreakdownBlock title="ตามจังหวัด/รัฐ" rows={data.topRegion} />
            <BreakdownBlock title="ตามเขต/เมือง" rows={data.topCity} />
          </section>
        </>
      ) : null}
    </PageFrame>
  );
}

function Stat({ label, value, accent, wide }: { label: string; value: string; accent?: boolean; wide?: boolean }) {
  return (
    <div className={`ipi-stat ${accent ? "is-accent" : ""} ${wide ? "is-wide" : ""}`}>
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}

function BreakdownBlock({ title, rows, link, active }: { title: string; rows: Breakdown; link?: "country"; active?: string }) {
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
              <span className="ipi-bd-bar" style={{ width: `${Math.max(6, (r.n / max) * 100)}%` }} />
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
            <div key={r.label} className="ipi-bd-row">{body}</div>
          );
        })
      )}
    </div>
  );
}
