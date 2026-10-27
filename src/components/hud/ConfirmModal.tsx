"use client";

import { useEffect, type ReactNode } from "react";

/** In-app confirmation dialog — replaces the browser's native confirm(). */
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
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
      if (e.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onCancel]);

  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation" onClick={() => !pending && onCancel()}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        {body && <div className="modal-body">{body}</div>}
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn btn-${tone === "danger" ? "danger" : "success"}`} onClick={onConfirm} disabled={pending} autoFocus>
            {pending ? "กำลังลบ..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
