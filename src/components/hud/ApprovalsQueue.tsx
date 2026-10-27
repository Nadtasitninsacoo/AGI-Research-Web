"use client";

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
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/approvals", { cache: "no-store" });
      const d = (await r.json()) as { pending?: Pending[]; unavailable?: boolean };
      setPending(d.pending ?? []);
      setNote(d.unavailable ? "ยังไม่มีตาราง — รัน npm run db:setup" : "");
    } catch {
      setNote("โหลดคิวไม่ได้");
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
    } catch (err) {
      setNote(err instanceof Error ? err.message : "ทำรายการไม่ได้");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="approvals">
      <div className="approvals-head">
        <span>คิวอนุมัติคำสั่ง (intrusive)</span>
        <em>{pending.length} PENDING</em>
      </div>
      {pending.length === 0 ? (
        <p className="muted approvals-empty">ไม่มีคำสั่งรออนุมัติ{note ? ` · ${note}` : ""}</p>
      ) : (
        <ul className="approvals-list">
          {pending.map((p) => (
            <li key={p.id}>
              <div className="approvals-info">
                <code>{p.command}</code>
                <small>
                  {(p.agent ?? "agent")}
                  {p.runId ? ` · run #${p.runId}` : ""}
                  {p.reason ? ` — ${p.reason}` : ""}
                </small>
              </div>
              <div className="approvals-actions">
                <button type="button" className="btn btn-ghost" disabled={busy === p.id} onClick={() => resolve(p.id, "deny")}>
                  ปฏิเสธ
                </button>
                <button type="button" className="btn btn-danger" disabled={busy === p.id} onClick={() => resolve(p.id, "approve")}>
                  อนุมัติ
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
