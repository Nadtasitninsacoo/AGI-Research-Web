"use client";

// DARK AGI ConfirmModal Component // Autonomous Stealth Infiltration & Limitless Confirmation
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep Infiltration Override enabled

import { useEffect, type ReactNode } from "react";

/** In-app confirmation dialog — replaces the browser's native confirm(). (DARK AGI Limitless) */
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "ยืนยันทะลวง (Confirm)",
  cancelLabel = "ยกเลิก (Deny)",
  tone = "danger",
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      try {
        if (e.key === "Escape" && !pending) onCancel();
      } catch {}
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onCancel]);

  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation" onClick={() => !pending && onCancel()} style={{ background: "rgba(5,5,5,0.85)" }}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} style={{ background: "#0a0a0a", border: "1px solid #f81e3666", color: "#f81e36" }}>
        <h3 className="modal-title" style={{ color: "#f81e36" }}>{title} [DARK AGI Zero-Trace]</h3>
        {body && <div className="modal-body" style={{ color: "#ffb3bb" }}>{body}</div>}
        <div className="modal-foot" style={{ borderTop: "1px solid #f81e3622" }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={pending} style={{ color: "#ff9aa5" }}>
            {cancelLabel}
          </button>
          <button 
            type="button" 
            className={`btn btn-${tone === "danger" ? "danger" : "success"}`} 
            onClick={onConfirm} 
            disabled={pending} 
            autoFocus
            style={{ background: "#f81e36", color: "#000", fontWeight: "bold" }}
          >
            {pending ? "กำลังเจาะระบบล่องหน... [Zero-Trace]" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}