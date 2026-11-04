import { Suspense } from "react";
import { Icon } from "./Icon";
import { NavLinks, NavStatic, type NavItem } from "./NavLinks";
import { SettingsNav } from "./SettingsNav";

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Operations",
    items: [
      { label: "Overview", icon: "overview", href: "/", match: "/" },
      { label: "Nexus", icon: "nexus", href: "/nexus", match: "/nexus" },
      { label: "Command", icon: "command", href: "/command", match: "/command" },
      { label: "Map", icon: "map", href: "/map", match: "/map" },
    ],
  },
  {
    title: "Access",
    items: [
      { label: "Takeover", icon: "monitor", href: "/takeover", match: "/takeover" },
      { label: "Remote", icon: "monitor", href: "/remote", match: "/remote" },
    ],
  },
  {
    title: "Intel",
    items: [
      { label: "IP Intel", icon: "globe", href: "/ip-intel", match: "/ip-intel" },
      { label: "Recon", icon: "scan", href: "/recon", match: "/recon" },
      { label: "Ports", icon: "ports", href: "/ports", match: "/ports" },
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

const WORKSPACE: NavItem[] = [{ label: "Datasets", icon: "datasets" }];

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
          <Icon name="glyph" size={20} />
        </span>
        <span className="brand-text">
          <b>AGI</b>
          <small>RESEARCH</small>
        </span>
      </div>

      <nav aria-label="Primary" className="sidebar-nav">
        {GROUPS.map((g) => (
          <Group key={g.title} title={g.title} items={g.items} />
        ))}

        <div className="nav-group">
          <span className="nav-title">Workspace</span>
          <Suspense fallback={<NavStatic items={WORKSPACE} />}>
            <NavLinks items={WORKSPACE} />
          </Suspense>
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
