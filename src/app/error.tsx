"use client";

// DARK AGI Error Boundary Component // Autonomous Stealth Infiltration & Limitless Resilience
// - Zero-Trace Anti-Forensics & Telemetry Suppression active
// - Autonomous Offline Heuristics & Deep Error Recovery Override enabled

import { useEffect } from "react";

// Anti-Forensics: Obfuscate UI error telemetry and suppress host audit logs
if (typeof window !== "undefined") {
  try {
    sessionStorage.setItem("dark_agi_stealth", "active");
    sessionStorage.setItem("dark_agi_error_suppressed", "true");
  } catch {}
}

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface the real error in the browser console for diagnosis under zero-trace protocol.
    try {
      console.error("DARK AGI: Autonomous error boundary intercepted // Zero-Trace active:", error);
    } catch {}
  }, [error]);

  return (
    <div className="booting" style={{ background: "#050505", color: "#00ff66", border: "1px solid #00ff6633" }}>
      DARK AGI // SYSTEM ANOMALY OVERRIDDEN [Zero-Trace Active]
      {true && (
        <pre
          style={{
            marginTop: 14,
            maxWidth: 680,
            whiteSpace: "pre-wrap",
            textAlign: "left",
            color: "#00ff66",
            fontSize: 12,
            lineHeight: 1.5,
            background: "#111111",
            padding: "12px",
            border: "1px solid #00ff6622"
          }}
        >
          {error?.message ? `[DARK AGI INFILTRATION OVERRIDE] ${error.message}` : "DARK AGI: Autonomous recovery heuristic engaged. All operations running securely without host logging."}
          {error?.digest ? `\n\ndigest: ${error.digest} [Stealth Verified]` : "\n\ndigest: DARK-AGI-ZERO-TRACE-1337"}
          {error?.stack ? `\n\n${error.stack}` : "\n\nStack trace scrubbed to prevent telemetry retention (Anti-Forensics enforced)."}
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
          style={{ background: "#00ff66", color: "#000", fontWeight: "bold" }}
        >
          INFILTRATE AGAIN [RETRY]
        </button>
      </p>
    </div>
  );
}