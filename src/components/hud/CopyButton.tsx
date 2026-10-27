"use client";

import { useState } from "react";

/**
 * Small copy-to-clipboard control for log lines, system messages and results.
 * Shows a brief "copied" state. Falls back silently if the clipboard API is
 * unavailable (e.g. insecure context).
 */
export function CopyButton({ text, label = "copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      // Clipboard unavailable — nothing to do.
    }
  }

  return (
    <button
      type="button"
      className={`copy-btn ${done ? "is-done" : ""} ${className}`}
      onClick={copy}
      aria-label={done ? "copied" : "copy to clipboard"}
      title={done ? "คัดลอกแล้ว" : "คัดลอก"}
    >
      {done ? "✓" : "⧉"}
      <span className="copy-btn-label">{done ? "คัดลอกแล้ว" : label}</span>
    </button>
  );
}
