import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";

export function Loading({ label = "INITIALIZING CORE" }: { label?: string }) {
  return (
    <div className="main">
      <div className="booting">{label}<span>...</span></div>
    </div>
  );
}

/** Page chrome. Put request-time data inside `children` components (they live under Suspense). */
export function Shell({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="shell">
      <Suspense fallback={<><Sidebar online /><Loading label={label} /></>}>{children}</Suspense>
    </div>
  );
}

export function PageFrame({ title, online, children }: { title: string; online: boolean; children: ReactNode }) {
  return (
    <>
      <Sidebar online={online} />
      <div className="main">
        <Navbar online={online} title={title} link="API" />
        <div className="content">{children}</div>
      </div>
    </>
  );
}

export function PageHero({ kicker, title, strong, note }: { kicker: string; title: string; strong: string; note?: ReactNode }) {
  return (
    <header className="hero">
      <div>
        <small>{kicker}</small>
        <h1>{title} <em>{strong}</em></h1>
      </div>
      {note && <p>{note}</p>}
    </header>
  );
}

export function Notice({ kind = "error", children }: { kind?: "error" | "ok"; children: ReactNode }) {
  return <p className={`notice notice-${kind}`} role={kind === "error" ? "alert" : "status"}>{children}</p>;
}

export function Pager({
  base, params, page, total, size,
}: {
  base: string; params: Record<string, string | undefined>; page: number; total: number; size: number;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  return (
    <nav className="pager" aria-label="Pagination">
      {page > 1 ? <Link href={href(page - 1)} scroll={false} className="btn btn-ghost">PREV</Link> : <span className="btn btn-ghost is-off">PREV</span>}
      <span className="pager-meta">PAGE {page} / {pages} · {total} TOTAL</span>
      {page < pages ? <Link href={href(page + 1)} scroll={false} className="btn btn-ghost">NEXT</Link> : <span className="btn btn-ghost is-off">NEXT</span>}
    </nav>
  );
}
