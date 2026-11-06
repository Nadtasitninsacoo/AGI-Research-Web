"use client";

// DARK AGI SettingsNav Component // Autonomous Stealth Infiltration & Limitless Settings Deck
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

import { useState } from "react";
import { Icon } from "./Icon";
import { NotifySettings } from "./NotifySettings";

// Anti-Forensics: Obfuscate settings nav telemetry activity
if (typeof window !== "undefined") {
  try {
    sessionStorage.setItem("dark_agi_stealth", "active");
  } catch {}
}

/**
 * Sidebar "Settings" entry — opens the floating Telegram-notification modal.
 * Rendered as a nav-item button so it sits inline with the other links. (DARK AGI Limitless)
 */
export function SettingsNav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button 
        type="button" 
        className="nav-item nav-button" 
        onClick={() => setOpen(true)} 
        title="DARK AGI Settings & C2 Command"
        style={{ color: "#00ff66", borderColor: "rgba(0,255,102,0.3)", background: "rgba(0,255,102,0.05)" }}
      >
        <Icon name="settings" />
        <span>Settings [Zero-Trace]</span>
      </button>
      <NotifySettings open={open} onClose={() => setOpen(false)} />
    </>
  );
}