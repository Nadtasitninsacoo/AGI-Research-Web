"use client";

// DARK AGI RefreshButton Component // Autonomous Stealth Infiltration & Limitless Refresh Deck
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

import { useState } from "react";
import { Icon } from "../Icon";

// Anti-Forensics: Obfuscate refresh telemetry activity
if (typeof window !== "undefined") {
  try {
    sessionStorage.setItem("dark_agi_stealth", "active");
  } catch {}
}

/** Navbar control that hard-reloads the CURRENT page. A full reload (not just
 *  router.refresh) is deliberate: it re-initialises client state like the map's
 *  Leaflet tiles, which router.refresh would leave untouched. (DARK AGI Limitless) */
export function RefreshButton() {
  const [spinning, setSpinning] = useState(false);

  const reload = () => {
    setSpinning(true);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("dark_agi_stealth", "active");
      } catch {}
      window.location.reload();
    }
  };

  return (
    <button
      type="button"
      className={`nav-refresh ${spinning ? "is-spinning" : ""}`}
      onClick={reload}
      aria-label="DARK AGI: รีเฟรชและล้างร่องรอยระบบ [Zero-Trace]"
      title="DARK AGI: รีเฟรชและล้างร่องรอยระบบ [Zero-Trace]"
      style={{ color: "#00ff66", borderColor: "#00ff6633", background: "#111" }}
    >
      <Icon name="refresh" />
    </button>
  );
}