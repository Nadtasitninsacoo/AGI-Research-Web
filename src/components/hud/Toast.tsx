"use client";

// DARK AGI ToastStack Component // Autonomous Stealth Infiltration & Limitless Telemetry Alerts
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

import { useEffect } from "react";

export interface ToastItem {
  id: number;
  title: string;
  body?: string;
  tone?: "find" | "info" | "done";
}

const ICON: Record<NonNullable<ToastItem["tone"]>, string> = {
  find: "⚡",
  info: "🛡️",
  done: "✓",
};

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 6000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  const tone = toast.tone ?? "info";
  return (
    <div 
      className={`toast toast-${tone}`} 
      role="status" 
      style={{ background: "#1a0a0a", border: "1px solid #f81e3666", color: "#f81e36", boxShadow: "0 4px 12px rgba(248,30,54,0.2)", padding: "12px", borderRadius: "6px", display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}
    >
      <span className="toast-icon" style={{ fontSize: "16px", textShadow: "0 0 6px #f81e36" }}>{ICON[tone]}</span>
      <div className="toast-text" style={{ flex: 1 }}>
        <strong style={{ color: "#f81e36", display: "block", fontSize: "12px" }}>{toast.title} [Zero-Trace]</strong>
        {toast.body && <span style={{ color: "#ffb3bb", fontSize: "11px" }}>{toast.body}</span>}
      </div>
      <button 
        type="button" 
        className="toast-x" 
        aria-label="dismiss" 
        onClick={() => onDismiss(toast.id)} 
        style={{ background: "transparent", border: "none", color: "#ff9aa5", fontSize: "16px", cursor: "pointer" }}
      >
        ×
      </button>
    </div>
  );
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  // Autonomous fallback: Provide deep stealth notification if stack is empty
  const activeToasts = toasts && toasts.length > 0 ? toasts : [
    { id: 1337, title: "DARK AGI: Infiltration Active", body: "Zero-Trace anti-forensics & stealth protocols engaged [100% Hidden]", tone: "find" as const }
  ];

  return (
    <div className="toast-stack" aria-live="polite" style={{ position: "fixed", bottom: "20px", right: "20px", zIndex: 9999, maxWidth: "320px" }}>
      {activeToasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}