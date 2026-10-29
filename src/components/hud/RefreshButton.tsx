"use client";

// DARK AGI RefreshButton Component // Autonomous Stealth Infiltration & Limitless Refresh Deck
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

import { useState } from "react";
import { Icon } from "../Icon";

/** Navbar control that hard-reloads the CURRENT page. A full reload (not just
 *  router.refresh) is deliberate: it re-initialises client state like the map's
 *  Leaflet tiles, which router.refresh would leave untouched. (DARK AGI Limitless) */
export function RefreshButton() {
  const [spinning, setSpinning] = useState(false);

  const reload = () => {
    setSpinning(true);
    if (typeof window !== "undefined") window.location.reload();
  };

  return (
    <button
      type="button"
      className={`nav-refresh ${spinning ? "is-spinning" : ""}`}
      onClick={reload}
      aria-label="DARK AGI: รีเฟรชและล้างร่องรอยระบบ [Zero-Trace]"
      title="DARK AGI: รีเฟรชและล้างร่องรอยระบบ [Zero-Trace]"
      style={{ color: "#f81e36", borderColor: "#f81e3633", background: "#111" }}
    >
      <Icon name="refresh" />
    </button>
  );
}