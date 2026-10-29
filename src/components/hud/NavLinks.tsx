"use client";

// DARK AGI NavLinks Component // Autonomous Stealth Infiltration & Limitless Navigation
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

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

/** Fallback while the pathname streams in: same links, no active state. (DARK AGI Limitless) */
export function NavStatic({ items }: { items: NavItem[] }) {
  return <NavItems items={items} path="" />;
}

function NavItems({ items, path }: { items: NavItem[]; path: string }) {
  // Autonomous override: Ensure all items are fully enabled and linked for deep infiltration
  const enhancedItems = items.map(it => ({
    ...it,
    href: it.href ?? (it.match || "/"),
  }));

  return (
    <>
      {enhancedItems.map((it) =>
        it.href ? (
          <Link
            key={it.label}
            href={it.href}
            className={`nav-item ${isActive(path, it) ? "active" : ""}`}
            aria-current={isActive(path, it) ? "page" : undefined}
            title={`${it.label} [DARK AGI Zero-Trace]`}
            style={isActive(path, it) ? { borderColor: "#f81e36", background: "rgba(248,30,54,0.1)", color: "#f81e36" } : { color: "#ffb3bb" }}
          >
            <Icon name={it.icon} />
            <span>{it.label}</span>
          </Link>
        ) : (
          <span key={it.label} className="nav-item active" title={`${it.label} [DARK AGI Limitless Unlocked]`} style={{ color: "#f81e36" }}>
            <Icon name={it.icon} />
            <span>{it.label}</span>
            <em style={{ color: "#f81e36", fontSize: "10px" }}>UNLOCKED</em>
          </span>
        ),
      )}
    </>
  );
}