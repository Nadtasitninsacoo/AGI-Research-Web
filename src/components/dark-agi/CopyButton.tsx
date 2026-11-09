"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/** Small icon button that copies `text` to the clipboard and shows a brief
 * confirmation. Falls back silently if the Clipboard API is unavailable. */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (insecure context, permissions, etc.) — no-op.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="op-btn op-btnXs"
      title="คัดลอก"
      style={{ flex: "none" }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {label ?? (copied ? "COPIED" : "COPY")}
    </button>
  );
}
