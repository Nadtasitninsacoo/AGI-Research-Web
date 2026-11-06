"use client";

// Error boundary component
// - Surfaces the real error for diagnosis and offers a retry.

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface the real error in the browser console for diagnosis.
    try {
      console.error("Error boundary caught an error:", error);
    } catch {}
  }, [error]);

  return (
    <div className="booting" style={{ background: "#050505", color: "#f81e36", border: "1px solid #f81e3633" }}>
      System error
      {true && (
        <pre
          style={{
            marginTop: 14,
            maxWidth: 680,
            whiteSpace: "pre-wrap",
            textAlign: "left",
            color: "#f81e36",
            fontSize: 12,
            lineHeight: 1.5,
            background: "#111111",
            padding: "12px",
            border: "1px solid #f81e3622"
          }}
        >
          {error?.message ? error.message : "An unexpected error occurred."}
          {error?.digest ? `\n\ndigest: ${error.digest}` : "\n\ndigest: unavailable"}
          {error?.stack ? `\n\n${error.stack}` : "\n\nNo stack trace available."}
        </pre>
      )}
      <p style={{ marginTop: 18 }}>
        <button 
          type="button" 
          className="btn" 
          onClick={() => {
            try {
              reset();
            } catch {
              window.location.reload();
            }
          }}
          style={{ background: "#f81e36", color: "#000", fontWeight: "bold" }}
        >
RETRY
        </button>
      </p>
    </div>
  );
}