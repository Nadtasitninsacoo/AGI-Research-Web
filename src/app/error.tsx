"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface the real error in the browser console for diagnosis.
    console.error("App error boundary caught:", error);
  }, [error]);

  return (
    <div className="booting">
      SOMETHING WENT WRONG
      {process.env.NODE_ENV !== "production" && (
        <pre
          style={{
            marginTop: 14,
            maxWidth: 680,
            whiteSpace: "pre-wrap",
            textAlign: "left",
            color: "#ff9aa5",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          {error?.message}
          {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
          {error?.stack ? `\n\n${error.stack}` : ""}
        </pre>
      )}
      <p style={{ marginTop: 18 }}>
        <button type="button" className="btn" onClick={reset}>TRY AGAIN</button>
      </p>
    </div>
  );
}
