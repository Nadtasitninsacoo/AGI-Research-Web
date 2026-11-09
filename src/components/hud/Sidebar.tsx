import { Suspense } from "react";
import { NavLinks, NavStatic, type NavItem } from "./NavLinks";
import { SettingsNav } from "./SettingsNav";

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Operations",
    items: [
      { label: "Overview", icon: "overview", href: "/", match: "/" },
      { label: "Nexus", icon: "nexus", href: "/nexus", match: "/nexus" },
      { label: "Command", icon: "command", href: "/command", match: "/command" },
      { label: "Execute", icon: "rocket", href: "/execute", match: "/execute" },
      { label: "Map", icon: "map", href: "/map", match: "/map" },
      { label: "DARK AGI", icon: "command", href: "/dark-agi", match: "/dark-agi" },
    ],
  },
  {
    title: "Access",
    items: [
      { label: "Vuln Analysis", icon: "shield", href: "/takeover", match: "/takeover" },
      { label: "Live Theater", icon: "monitor", href: "/remote", match: "/remote" },
    ],
  },
  {
    title: "Intel",
    items: [
      { label: "IP Vault", icon: "globe", href: "/ip-intel", match: "/ip-intel" },
      { label: "Threat Intel", icon: "radar", href: "/threat-intel", match: "/threat-intel" },
      { label: "Recon", icon: "scan", href: "/recon", match: "/recon" },
      { label: "USB Lab", icon: "usb", href: "/usb", match: "/usb" },
    ],
  },
  {
    title: "Research",
    items: [
      { label: "Agents", icon: "agents", href: "/agents", match: "/agents" },
      { label: "Experiments", icon: "experiments", href: "/experiments", match: "/experiments" },
      { label: "Runs", icon: "runs", href: "/runs", match: "/runs" },
      { label: "Run Batches", icon: "logs", href: "/run-batches", match: "/run-batches" },
      { label: "Results", icon: "bench", href: "/successful-results", match: "/successful-results" },
    ],
  },
];

function Group({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div className="nav-group">
      <span className="nav-title">{title}</span>
      <Suspense fallback={<NavStatic items={items} />}>
        <NavLinks items={items} />
      </Suspense>
    </div>
  );
}

export function Sidebar({ online }: { online: boolean }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-glyph">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/agi-logo.png"
            alt="AGI Research"
            width={34}
            height={29}
            style={{ height: 28, width: "auto", display: "block" }}
          />
        </span>
        <span className="brand-text">
          <b>AGI</b>
          <small>RESEARCH</small>
        </span>
      </div>

      <div
        className={`sidebar-status ${online ? "is-on" : "is-off"}`}
        title={online ? "ระบบออนไลน์" : "ระบบออฟไลน์"}
      >
        <span className="sidebar-status-dot" />
        <span className="sidebar-status-text">{online ? "ONLINE" : "OFFLINE"}</span>
      </div>

      <nav aria-label="Primary" className="sidebar-nav">
        {GROUPS.map((g) => (
          <Group key={g.title} title={g.title} items={g.items} />
        ))}

        <div className="nav-group">
          <span className="nav-title">Workspace</span>
          <SettingsNav />
        </div>
      </nav>

      <div className={`core-card ${online ? "is-on" : "is-off"}`}>
        <span className={`led ${online ? "led-on" : "led-off"}`} />
        <div>
          <small>CORE LINK</small>
          <b>{online ? "STABLE" : "SEVERED"}</b>
        </div>
      </div>
    </aside>
  );
}
