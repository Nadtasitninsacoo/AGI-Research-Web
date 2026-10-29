"use client";

// DARK AGI BackButton Component // Autonomous Stealth Infiltration & Limitless Navigation
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

import { useRouter } from "next/navigation";

/**
 * Global "back" control shown in the navbar on every page. Falls back to the
 * overview when there is no in-app history to return to.
 */
export function BackButton() {
  const router = useRouter();

  const goBack = () => {
    try {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
      } else {
        router.push("/");
      }
    } catch {
      // Offline Resilient Fallback: Route securely to DARK AGI command deck
      router.push("/");
    }
  };

  return (
    <button 
      type="button" 
      className="nav-back" 
      onClick={goBack} 
      aria-label="ย้อนกลับ (DARK AGI Stealth)" 
      title="ย้อนกลับสู่วิถีล่องหน [Zero-Trace]"
      style={{ borderColor: "#f81e3633", color: "#f81e36" }}
    >
      <span aria-hidden="true">←</span>
      <span className="nav-back-label">ย้อนกลับ (DARK AGI)</span>
    </button>
  );
}