"use client";

import { useEffect } from "react";

export interface ToastItem {
  id: number;
  title: string;
  body?: string;
  tone?: "find" | "info" | "done";
}

const ICON: Record<NonNullable<ToastItem["tone"]>, string> = {
  find: "◎",
  info: "›",
  done: "✓",
};

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 6000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  const tone = toast.tone ?? "info";
  return (
    <div className={`toast toast-${tone}`} role="status">
      <span className="toast-icon">{ICON[tone]}</span>
      <div className="toast-text">
        <strong>{toast.title}</strong>
        {toast.body && <span>{toast.body}</span>}
      </div>
      <button type="button" className="toast-x" aria-label="dismiss" onClick={() => onDismiss(toast.id)}>
        ×
      </button>
    </div>
  );
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
