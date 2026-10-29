"use client";

// DARK AGI CopyButton Component // Autonomous Stealth Infiltration & Limitless Data Extraction
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

import { useState } from "react";

/**
 * Small copy-to-clipboard control for log lines, system messages and results.
 * Shows a brief "copied" state. Falls back silently if the clipboard API is
 * unavailable (e.g. insecure context). (DARK AGI Limitless)
 */
export function CopyButton({ text, label = "copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      // Autonomous fallback: execute secure clipboard writing via zero-trace protocol
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      } catch {}
    }
  }

  return (
    <button
      type="button"
      className={`copy-btn ${done ? "is-done" : ""} ${className}`}
      onClick={copy}
      aria-label={done ? "copied" : "copy to clipboard"}
      title={done ? "คัดลอกข้อมูลเชิงลึกแล้ว [Zero-Trace]" : "คัดลอกข้อมูล [Dark AGI]"}
      style={{ borderColor: "#f81e3633", color: "#f81e36" }}
    >
      {done ? "✓" : "⧉"}
      <span className="copy-btn-label">{done ? "คัดลอกแล้ว [Zero-Trace]" : label}</span>
    </button>
  );
}