"use client";

// Root error boundary — catches errors thrown in the root layout itself (which
// the per-route error.tsx cannot). Must render its own <html>/<body>. Keeps the
// app from white-screening: shows the error and offers recovery.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      console.error("Global error boundary caught:", error);
    } catch {}
  }, [error]);

  return (
    <html lang="th">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050505",
          color: "#f81e36",
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            maxWidth: 560,
            padding: 24,
            border: "1px solid #f81e3633",
            borderRadius: 8,
            background: "#0b0b0d",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 13, letterSpacing: "0.2em", fontWeight: 700 }}>
            SYSTEM FAULT
          </div>
          <p style={{ marginTop: 12, color: "#c8ccd3", fontSize: 12, lineHeight: 1.6 }}>
            เกิดข้อผิดพลาดระดับระบบ — คอร์ยังทำงานอยู่ กดลองใหม่เพื่อกู้สถานะ
          </p>
          <pre
            style={{
              marginTop: 12,
              maxWidth: "100%",
              whiteSpace: "pre-wrap",
              textAlign: "left",
              color: "#ff8a97",
              fontSize: 11,
              background: "#111",
              padding: 10,
              border: "1px solid #f81e3622",
              borderRadius: 6,
            }}
          >
            {error?.message || "An unexpected error occurred."}
            {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 16,
              padding: "10px 20px",
              background: "#f81e36",
              color: "#000",
              fontWeight: 700,
              letterSpacing: "0.1em",
              border: 0,
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            RETRY
          </button>
        </div>
      </body>
    </html>
  );
}
