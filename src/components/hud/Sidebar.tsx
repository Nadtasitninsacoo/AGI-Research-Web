import { Suspense } from "react";
import { Icon } from "./Icon";
import { NavLinks, NavStatic, type NavItem } from "./NavLinks";

const NAVIGATE: NavItem[] = [
  { label: "Overview", icon: "overview", href: "/", match: "/" },
  { label: "Nexus", icon: "nexus", href: "/nexus", match: "/nexus" },
  { label: "Command", icon: "command", href: "/command", match: "/command" },
  { label: "Map", icon: "map", href: "/map", match: "/map" },
  { label: "Agents", icon: "agents", href: "/agents", match: "/agents" },
  { label: "Experiments", icon: "experiments", href: "/experiments", match: "/experiments" },
  { label: "Runs", icon: "runs", href: "/runs", match: "/runs" },
  { label: "Benchmarks", icon: "bench", href: "/#benchmarks" },
  { label: "Logs", icon: "logs", href: "/#logs" },
];

const WORKSPACE: NavItem[] = [
  { label: "Datasets", icon: "datasets" },
  { label: "Settings", icon: "settings" },
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
        <span className="brand-glyph"><Icon name="glyph" size={26} /></span>
        <span className="brand-text">
          <b>AGI</b>
          <small>RESEARCH</small>
        </span>
      </div>

      <nav aria-label="Primary">
        <Group title="NAVIGATE" items={NAVIGATE} />
        <Group title="WORKSPACE" items={WORKSPACE} />
      </nav>

      <div className="core-card">
        <span className={`led ${online ? "led-on" : "led-off"}`} />
        <div>
          <small>CORE LINK</small>
          <b>{online ? "STABLE" : "SEVERED"}</b>
        </div>
      </div>
    </aside>
  );
}
