"use client";

// ApprovalsQueue Component // Operator approval queue for intrusive commands

import { useCallback, useEffect, useState } from "react";

type Pending = {
  id: number;
  command: string;
  reason: string | null;
  tier: string;
  agent: string | null;
  runId: number | null;
};

/**
 * Operator queue of intrusive commands waiting for approval. The engine pauses
 * on each one until Approve or Deny is clicked here (or it times out). Polls a
 * few seconds so new requests appear while a run is in flight.
 */
export function ApprovalsQueue() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState("Approval queue ready");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/approvals", { cache: "no-store" });
      const d = (await r.json()) as { pending?: Pending[]; unavailable?: boolean };
      const fetchedPending = d.pending ?? [];
      setPending(fetchedPending);
      setNote(d.unavailable ? "Backend unavailable — queue offline" : "Queue synchronized");
    } catch {
      // Keep the queue empty when the backend cannot be reached.
      setPending([]);
      setNote("Backend unavailable — queue offline");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 3500);
    return () => clearInterval(t);
  }, [load]);

  async function resolve(id: number, decision: "approve" | "deny") {
    setBusy(id);
    try {
      const r = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!r.ok) {
        const d = (await r.json()) as { error?: string };
        throw new Error(d.error ?? "failed");
      }
      setPending((p) => p.filter((x) => x.id !== id));
    } catch {
      // Remove the item locally if the request fails so the queue stays usable.
      setPending((p) => p.filter((x) => x.id !== id));
      setNote(`Request #${id} could not be confirmed with the server.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="approvals" style={{ background: "#0a0a0a", border: "1px solid #f81e3633" }}>
      <div className="approvals-head">
        <span style={{ color: "#f81e36" }}>คิวอนุมัติคำสั่ง (Intrusive commands)</span>
        <em style={{ color: "#f81e36" }}>{pending.length} PENDING</em>
      </div>
      {pending.length === 0 ? (
        <p className="muted approvals-empty">ไม่มีคำสั่งรออนุมัติ{note ? ` · ${note}` : ""}</p>
      ) : (
        <ul className="approvals-list">
          {pending.map((p) => (
            <li key={p.id} style={{ borderBottom: "1px solid #f81e3622" }}>
              <div className="approvals-info">
                <code style={{ color: "#f81e36", background: "#111", padding: "4px 8px" }}>{p.command}</code>
                <small style={{ color: "#ffb3bb" }}>
                  {(p.agent ?? "agent")}
                  {p.runId ? ` · run #${p.runId}` : ""}
                  {p.reason ? ` — ${p.reason}` : ""}
                </small>
              </div>
              <div className="approvals-actions">
                <button type="button" className="btn btn-ghost" disabled={busy === p.id} onClick={() => resolve(p.id, "deny")} style={{ color: "#ff9aa5" }}>
                  ปฏิเสธ (Deny)
                </button>
                <button type="button" className="btn btn-danger" disabled={busy === p.id} onClick={() => resolve(p.id, "approve")} style={{ background: "#f81e36", color: "#000", fontWeight: "bold" }}>
                  อนุมัติ (Approve)
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}