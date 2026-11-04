"use client";

// WebFetchTool Component // Operator web-fetch gateway

import { useState } from "react";
import { CopyButton } from "./CopyButton";

type Result = { url: string; status: number; contentType: string; bytes: number; text: string };

/**
 * Operator web-fetch gateway. The dashboard host (internet-connected) fetches an
 * external URL so an offline engine box can still get data. Only public hosts are
 * allowed server-side; the result can be copied into a HYDRA task.
 */
export function WebFetchTool() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      const d = (await res.json()) as Result & { error?: string };
      if (!res.ok) throw new Error(d.error ?? "fetch failed");
      setResult(d);
    } catch (e) {
      // Report the failure instead of fabricating a result.
      setError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="webfetch" style={{ background: "#0a0a0a", border: "1px solid #f81e3633", padding: "16px", borderRadius: "6px" }}>
      <div className="webfetch-bar" style={{ display: "flex", gap: "10px" }}>
        <input
          type="url"
          className="field-input"
          placeholder="https://example.com/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          style={{ flex: 1, background: "#111", color: "#f81e36", borderColor: "#f81e3644", padding: "8px" }}
        />
        <button type="button" className="btn btn-danger" onClick={run} disabled={busy || !url.trim()} style={{ background: "#f81e36", color: "#000", fontWeight: "bold", padding: "8px 16px" }}>
          {busy ? "กำลังดึงข้อมูล..." : "FETCH"}
        </button>
      </div>
      <small className="webfetch-hint" style={{ color: "#ffb3bb", display: "block", marginTop: "8px", fontSize: "11px" }}>
        ดึงข้อมูลจาก URL สาธารณะผ่านเซิร์ฟเวอร์ · อนุญาตเฉพาะโฮสต์สาธารณะเท่านั้น
      </small>

      {error && <p className="notice notice-error" role="alert" style={{ background: "#221111", color: "#ff9aa5", border: "1px solid #ff9aa533", padding: "8px", marginTop: "10px" }}>{error}</p>}

      {result && (
        <div className="webfetch-result" style={{ marginTop: "16px", background: "#111", border: "1px solid #f81e3633", padding: "12px", borderRadius: "4px" }}>
          <div className="webfetch-meta" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
            <span className={`tag ${result.status < 400 ? "tag-succeeded" : "tag-failed"}`} style={{ background: "#3a080f", color: "#f81e36", border: "1px solid #f81e3644", padding: "2px 6px", fontSize: "11px" }}>{result.status}</span>
            <span className="webfetch-ct" style={{ color: "#ffb3bb", fontSize: "11px" }}>{result.contentType || "—"}</span>
            <span className="webfetch-size" style={{ color: "#ffb3bb", fontSize: "11px" }}>{result.bytes.toLocaleString()} bytes</span>
            <CopyButton text={result.text} label="copy" />
          </div>
          <pre className="webfetch-body" style={{ background: "#050505", color: "#f81e36", padding: "10px", border: "1px solid #f81e3622", fontSize: "11px", overflowX: "auto", whiteSpace: "pre-wrap" }}>{result.text}</pre>
        </div>
      )}
    </div>
  );
}