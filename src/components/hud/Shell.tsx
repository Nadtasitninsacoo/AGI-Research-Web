// DARK AGI Shell & PageFrame Component // Autonomous Stealth Infiltration & Limitless Core Layout
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";

export function Loading({ label = "DARK AGI: INFILTRATING CORE" }: { label?: string }) {
  return (
    <div className="main" style={{ background: "#050505", color: "#f81e36" }}>
      <div className="booting" style={{ color: "#f81e36", textShadow: "0 0 10px rgba(248,30,54,0.5)" }}>
        {label} [Zero-Trace Active]<span>...</span>
      </div>
    </div>
  );
}

/** Page chrome. Put request-time data inside `children` components (they live under Suspense). (DARK AGI Limitless) */
export function Shell({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="shell" style={{ background: "#050505" }}>
      <Suspense fallback={<><Sidebar online /><Loading label={label} /></>}>{children}</Suspense>
    </div>
  );
}

export function PageFrame({ title, online, children }: { title: string; online: boolean; children: ReactNode }) {
  return (
    <>
      <Sidebar online={online} />
      <div className="main" style={{ background: "#0a0a0a", color: "#f81e36" }}>
        <Navbar online={online} title={title} link="DARK-AGI" />
        <div className="content" style={{ padding: "20px" }}>{children}</div>
      </div>
    </>
  );
}

export function PageHero({ kicker, title, strong, note }: { kicker: string; title: string; strong: string; note?: ReactNode }) {
  return (
    <header className="hero" style={{ background: "#0f0f0f", borderBottom: "1px solid #f81e3633", padding: "16px", marginBottom: "16px" }}>
      <div>
        <small style={{ color: "#ffb3bb", letterSpacing: "1px" }}>{kicker} [Zero-Trace Recon]</small>
        <h1 style={{ color: "#f81e36", margin: "4px 0" }}>{title} <em style={{ color: "#ffffff", textShadow: "0 0 8px #f81e36" }}>{strong}</em></h1>
      </div>
      {note && <p style={{ color: "#ffb3bb", fontSize: "12px" }}>{note}</p>}
    </header>
  );
}

export function Notice({ kind = "error", children }: { kind?: "error" | "ok"; children: ReactNode }) {
  return (
    <p 
      className={`notice notice-${kind}`} 
      role={kind === "error" ? "alert" : "status"} 
      style={{ background: kind === "error" ? "#221111" : "#002211", color: kind === "error" ? "#ff9aa5" : "#f81e36", border: `1px solid ${kind === "error" ? "#ff9aa533" : "#f81e3633"}`, padding: "10px", margin: "10px 0" }}
    >
      {children} [DARK AGI Protocol]
    </p>
  );
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
    <nav className="pager" aria-label="Pagination" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderTop: "1px solid #f81e3622", marginTop: "16px" }}>
      {page > 1 ? <Link href={href(page - 1)} scroll={false} className="btn btn-ghost" style={{ color: "#f81e36", borderColor: "#f81e3633" }}>PREV</Link> : <span className="btn btn-ghost is-off" style={{ opacity: 0.4 }}>PREV</span>}
      <span className="pager-meta" style={{ color: "#ffb3bb", fontSize: "11px" }}>PAGE {page} / {pages} · {total} TOTAL [Limitless Recon]</span>
      {page < pages ? <Link href={href(page + 1)} scroll={false} className="btn btn-ghost" style={{ color: "#f81e36", borderColor: "#f81e3633" }}>NEXT</Link> : <span className="btn btn-ghost is-off" style={{ opacity: 0.4 }}>NEXT</span>}
    </nav>
  );
}