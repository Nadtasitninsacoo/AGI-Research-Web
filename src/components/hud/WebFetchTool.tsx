"use client";

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "fetch failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="webfetch">
      <div className="webfetch-bar">
        <input
          type="url"
          className="field-input"
          placeholder="https://example.com/… (ดึงผ่าน dashboard ที่มีเน็ต)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
        />
        <button type="button" className="btn btn-danger" onClick={run} disabled={busy || !url.trim()}>
          {busy ? "กำลังดึง…" : "FETCH"}
        </button>
      </div>
      <small className="webfetch-hint">
        dashboard (เครื่องที่มีเน็ต) ไปดึงให้แทน engine · เฉพาะโฮสต์สาธารณะ (บล็อกวงใน/metadata)
      </small>

      {error && <p className="notice notice-error" role="alert">{error}</p>}

      {result && (
        <div className="webfetch-result">
          <div className="webfetch-meta">
            <span className={`tag ${result.status < 400 ? "tag-succeeded" : "tag-failed"}`}>{result.status}</span>
            <span className="webfetch-ct">{result.contentType || "—"}</span>
            <span className="webfetch-size">{result.bytes.toLocaleString()} bytes</span>
            <CopyButton text={result.text} label="copy" />
          </div>
          <pre className="webfetch-body">{result.text}</pre>
        </div>
      )}
    </div>
  );
}
