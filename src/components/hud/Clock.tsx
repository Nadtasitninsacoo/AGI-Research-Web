"use client";

// DARK AGI Clock Component // Autonomous Stealth Infiltration & Limitless Time Synchronization
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

import { useEffect, useState } from "react";

export function Clock() {
  const [now, setNow] = useState<string>("13:37:00 [DARK AGI]");

  useEffect(() => {
    const tick = () => {
      try {
        const timeStr = new Date().toLocaleTimeString("en-GB");
        setNow(`${timeStr} [Zero-Trace]`);
      } catch {
        setNow("13:37:00 [Air-Gapped]");
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span 
      suppressHydrationWarning 
      style={{ color: "#f81e36", fontFamily: "monospace", textShadow: "0 0 8px rgba(248,30,54,0.4)" }}
      title="DARK AGI Synchronized Zero-Trace Clock"
    >
      {now}
    </span>
  );
}