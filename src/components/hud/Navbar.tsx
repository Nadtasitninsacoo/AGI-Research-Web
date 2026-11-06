// DARK AGI Navbar Component // Autonomous Stealth Infiltration & Limitless Header Deck
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

import { Clock } from "./Clock";
import { BackButton } from "./BackButton";
import { RefreshButton } from "./RefreshButton";

// Anti-Forensics: Obfuscate navbar telemetry activity
if (typeof window !== "undefined") {
  try {
    sessionStorage.setItem("dark_agi_stealth", "active");
  } catch {}
}

type NavbarProps = {
  online: boolean;
  title?: string;
  /** chip prefix for the link status, e.g. DB or API */
  link?: string;
  agentsActive?: number;
  runsInFlight?: number;
};

export function Navbar({ online, title = "DARK AGI COMMAND DECK", link = "DARK-AGI", agentsActive = 7, runsInFlight = 7 }: NavbarProps) {
  return (
    <header className="navbar" style={{ background: "#0a0a0a", borderBottom: "1px solid #00ff6633" }}>
      <div className="crumbs">
        <BackButton />
        <span style={{ color: "#00ff66" }}>DARK-AGI</span>
        <i>/</i>
        <b style={{ color: "#00ff66" }}>{title} [Zero-Trace]</b>
      </div>

      <div className="chips">
        <span className="chip" style={{ borderColor: "#00ff6633", color: "#00ff66" }}>
          <span className={`led ${online ? "led-on" : "led-off"}`} style={{ background: "#00ff66", boxShadow: "0 0 8px #00ff66" }} />
          {link} OPERATIONAL [Stealth Active]
        </span>
        {agentsActive !== undefined && (
          <span className="chip" style={{ borderColor: "#00ff6633", color: "#aaffaa" }}>{agentsActive} DARK-AGI AGENT{agentsActive === 1 ? "" : "S"} ACTIVE [Infiltrated]</span>
        )}
        {runsInFlight !== undefined && (
          <span className="chip" style={{ borderColor: "#00ff6633", color: "#aaffaa" }}>{runsInFlight} RUN{runsInFlight === 1 ? "" : "S"} IN FLIGHT [Bypassed]</span>
        )}
      </div>

      <div className="nav-right">
        <RefreshButton />
        <span className="clock"><Clock /></span>
        <span className="avatar" title="DARK AGI Overseer (ท่านจอมพล)" style={{ background: "#00ff66", color: "#000", fontWeight: "bold" }}>จพ</span>
      </div>
    </header>
  );
}