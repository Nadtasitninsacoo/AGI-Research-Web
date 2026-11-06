
import { Suspense, type ReactNode } from "react";
import Link from "next/link";

import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";

export function Loading({
  label = "LOADING AGI RESEARCH",
}: {
  label?: string;
}) {
  return (
    <div className="booting" role="status" style={{ gridColumn: "1 / -1" }}>
      {label}
      <span>...</span>
    </div>
  );
}

/**
 * Persistent application chrome.
 * Sidebar and Navbar remain visible after Suspense resolves.
 */
export function Shell({
  children,
  label = "AGI RESEARCH // OPERATIONS CENTER",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div className="shell flex min-h-screen w-full">
      <Sidebar online />

      <div className="main flex min-w-0 flex-1 flex-col">
        <Navbar
          online
          title={label}
          link="AGI RESEARCH"
        />

        <div className="content w-full min-w-0 flex-1">
          <Suspense fallback={<Loading label={label} />}>
            {children}
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export function PageFrame({
  title,
  online,
  children,
}: {
  title: string;
  online: boolean;
  children: ReactNode;
}) {
  // Shell now renders the persistent Sidebar/Navbar/.content chrome, so a
  // page frame only passes its content through (drawing chrome here would
  // nest a second sidebar + navbar inside the page).
  void title;
  void online;
  return <>{children}</>;
}

export function PageHero({
  kicker,
  title,
  strong,
  note,
}: {
  kicker: string;
  title: string;
  strong: string;
  note?: ReactNode;
}) {
  return (
    <header className="hero mb-4 border-b border-slate-800 bg-slate-900/60 px-6 py-5 sm:px-8 sm:py-6">
      <div>
        <small className="tracking-wider text-cyan-400">
          {kicker}
        </small>

        <h1 className="my-1 text-xl font-semibold text-slate-100">
          {title}{" "}
          <em className="not-italic text-cyan-400">
            {strong}
          </em>
        </h1>
      </div>

      {note && (
        <p className="mt-2 text-xs text-slate-400">
          {note}
        </p>
      )}
    </header>
  );
}

export function Notice({
  kind = "error",
  children,
}: {
  kind?: "error" | "ok";
  children: ReactNode;
}) {
  const isError = kind === "error";

  return (
    <p
      className={`notice notice-${kind} my-3 rounded-md border p-3 text-sm ${
        isError
          ? "border-rose-800 bg-rose-950/30 text-rose-300"
          : "border-emerald-800 bg-emerald-950/30 text-emerald-300"
      }`}
      role={isError ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

export function Pager({
  base,
  params,
  page,
  total,
  size,
}: {
  base: string;
  params: Record<string, string | undefined>;
  page: number;
  total: number;
  size: number;
}) {
  const pages = Math.max(1, Math.ceil(total / size));

  const href = (nextPage: number) => {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }

    if (nextPage > 1) {
      query.set("page", String(nextPage));
    }

    const search = query.toString();
    return search ? `${base}?${search}` : base;
  };

  return (
    <nav
      className="pager mt-4 flex items-center justify-between border-t border-slate-800 py-3"
      aria-label="Pagination"
    >
      {page > 1 ? (
        <Link
          href={href(page - 1)}
          scroll={false}
          className="btn btn-ghost"
        >
          PREV
        </Link>
      ) : (
        <span className="btn btn-ghost is-off opacity-40">
          PREV
        </span>
      )}

      <span className="pager-meta text-xs text-slate-400">
        PAGE {page} / {pages} · {total} TOTAL
      </span>

      {page < pages ? (
        <Link
          href={href(page + 1)}
          scroll={false}
          className="btn btn-ghost"
        >
          NEXT
        </Link>
      ) : (
        <span className="btn btn-ghost is-off opacity-40">
          NEXT
        </span>
      )}
    </nav>
  );
}
