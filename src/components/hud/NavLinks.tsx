"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

export type NavItem = { label: string; icon: IconName; href?: string; match?: string };

const isActive = (path: string, it: NavItem) => {
  if (!it.match) return false;
  return it.match === "/" ? path === "/" : path === it.match || path.startsWith(`${it.match}/`);
};

export function NavLinks({ items }: { items: NavItem[] }) {
  return <NavItems items={items} path={usePathname()} />;
}

/** Fallback while the pathname streams in: same links, no active state. */
export function NavStatic({ items }: { items: NavItem[] }) {
  return <NavItems items={items} path="" />;
}

function NavItems({ items, path }: { items: NavItem[]; path: string }) {
  return (
    <>
      {items.map((it) =>
        it.href ? (
          <Link
            key={it.label}
            href={it.href}
            className={`nav-item ${isActive(path, it) ? "active" : ""}`}
            aria-current={isActive(path, it) ? "page" : undefined}
            title={it.label}
          >
            <Icon name={it.icon} />
            <span>{it.label}</span>
          </Link>
        ) : (
          <span key={it.label} className="nav-item disabled" title={`${it.label} (soon)`}>
            <Icon name={it.icon} />
            <span>{it.label}</span>
            <em>SOON</em>
          </span>
        ),
      )}
    </>
  );
}
