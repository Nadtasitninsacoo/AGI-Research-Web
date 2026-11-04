"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bot,
  Play,
  RefreshCw,
  Database,
  AlertTriangle,
  CheckCircle2,
  Square,
} from "lucide-react";

import { listExecutionOptions } from "@/app/execute/options-actions";
import { createRunLocal, cancelRunAction } from "@/app/runs/actions";
import type { Experiment } from "@/lib/execution/types";

type LogRow = {
  id: number;
  level: string;
  message: string;
  createdAt: string;
};

type Snapshot = {
  run: {
    id: number;
    status: string;
    metrics?: { output?: string } | null;
    errorMessage?: string | null;
  };
  logs: LogRow[];
  logsTotal: number;
  evaluations: { id: number; benchmark: string; score: number }[];
} | null;

const FINAL = new Set(["succeeded", "failed", "needs_input", "cancelled"]);

const EXAMPLES = [
  "ค้น OSINT ของ 8.8.8.8 (osint_lookup) แล้วบันทึกพอร์ตที่เจอลงฐานข้อมูล",
  "lookup 1.1.1.1 and 9.9.9.9, save open ports, then summarize risks",
  "ตรวจ exposure ของโฮสต์ในขอบเขตที่ได้รับอนุญาต แล้วแนะนำการแก้ไข",
];

function statusTone(status: string | undefined): { label: string; color: string } {
  switch ((status ?? "").toLowerCase()) {
    case "running":
      return { label: "● กำลังทำงาน", color: "#2de2e6" };
    case "queued":
      return { label: "อยู่ในคิว", color: "#e0a33e" };
    case "succeeded":
      return { label: "✓ สำเร็จ", color: "#3ad29f" };
    case "failed":
      return { label: "✕ ล้มเหลว", color: "#f87171" };
    case "needs_input":
      return { label: "ต้องการข้อมูลเพิ่ม", color: "#e0a33e" };
    case "cancelled":
      return { label: "ยกเลิกแล้ว", color: "#8a8f99" };
    default:
      return { label: (status ?? "—").toUpperCase(), color: "#8a8f99" };
  }
}

export function MapAutoAgent() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [experimentId, setExperimentId] = useState("");
  const [command, setCommand] = useState("");
  const [runId, setRunId] = useState<number | null>(null);
  const [snap, setSnap] = useState<Snapshot>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const logBoxRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const opts = await listExecutionOptions();
        if (cancelled) return;
        setExperiments(opts.experiments);
        setExperimentId(
          opts.experiments.length > 0 ? String(opts.experiments[0].id) : "",
        );
        if (opts.experiments.length === 0) {
          setOptionsError("ไม่พบ Experiment/Agent ที่พร้อมใช้งาน");
        }
      } catch {
        if (!cancelled) setOptionsError("โหลดรายการเอเจนต์ไม่สำเร็จ");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the live run snapshot until it reaches a final state.
  useEffect(() => {
    if (runId === null) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/runs/${runId}/live`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as Snapshot;
        if (cancelled || !data?.run) return;
        setSnap(data);
        if (FINAL.has(String(data.run.status))) {
          clearInterval(timer);
        }
      } catch {
        /* keep polling */
      }
    }

    void tick();
    const timer = setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runId]);

  // Keep the log feed scrolled to the newest line.
  useEffect(() => {
    const el = logBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [snap]);

  async function submit() {
    const cmd = command.trim();
    if (!cmd || submitting || !experimentId) return;
    setError("");
    setSnap(null);
    setRunId(null);
    setSubmitting(true);
    try {
      const id = await createRunLocal({
        experimentId,
        params: { prompt: cmd, source: "map-auto" },
      });
      setRunId(Number(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "สั่งงานเอเจนต์ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function stop() {
    if (runId === null) return;
    const fd = new FormData();
    fd.set("runId", String(runId));
    try {
      await cancelRunAction(null, fd);
    } catch {
      /* best-effort */
    }
  }

  const status = snap?.run?.status;
  const tone = statusTone(status);
  const running = runId !== null && !FINAL.has(String(status ?? "queued"));
  const output = snap?.run?.metrics?.output;
  const logs = snap?.logs ?? [];
  const pctFindings = snap?.evaluations?.length ?? 0;

  return (
    <section
      style={{
        border: "1px solid rgba(45,226,230,0.3)",
        borderRadius: 12,
        background: "#0c0e15",
        padding: "16px 18px",
        marginBottom: 16,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            width: 26,
            height: 26,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 7,
            background: "rgba(45,226,230,0.12)",
            color: "#2de2e6",
          }}
        >
          <Bot size={15} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.02em" }}>
            AGENT AUTO RECON
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--dim, #8a8f99)",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            สั่งเป็นภาษาคน — เอเจนต์ค้นหา/ประเมินเอง บันทึกลงฐานข้อมูล แล้วสรุป+แนะนำ
          </div>
        </div>
        <span
          style={{
            fontSize: 10,
            color: "var(--dim, #8a8f99)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            padding: "3px 8px",
          }}
        >
          scope + approval gated
        </span>
      </header>

      {/* Command input */}
      <textarea
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        disabled={running}
        rows={2}
        placeholder="เช่น: ค้น OSINT ของ 8.8.8.8 แล้วบันทึกพอร์ตที่เจอ พร้อมแนะนำความเสี่ยง"
        style={{
          width: "100%",
          resize: "vertical",
          minHeight: 54,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "#0a0b10",
          color: "#eaeaea",
          fontSize: 13,
          fontFamily: "var(--font-mono), monospace",
          outline: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          margin: "8px 0",
        }}
      >
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={running}
            onClick={() => setCommand(ex)}
            style={{
              fontSize: 10,
              color: "var(--dim, #8a8f99)",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              padding: "4px 8px",
              cursor: running ? "not-allowed" : "pointer",
            }}
          >
            {ex.length > 46 ? ex.slice(0, 46) + "…" : ex}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <select
          value={experimentId}
          onChange={(e) => setExperimentId(e.target.value)}
          disabled={running || experiments.length === 0}
          style={{
            padding: "7px 10px",
            borderRadius: 7,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "#0a0b10",
            color: "#eaeaea",
            fontSize: 12,
          }}
        >
          {experiments.length === 0 && <option value="">— ไม่มีเอเจนต์ —</option>}
          {experiments.map((exp) => (
            <option key={exp.id} value={String(exp.id)}>
              {exp.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!command.trim() || submitting || running || !experimentId}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "8px 16px",
            borderRadius: 7,
            border: "1px solid rgba(45,226,230,0.5)",
            background: "rgba(45,226,230,0.14)",
            color: "#2de2e6",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.1em",
            cursor:
              !command.trim() || submitting || running || !experimentId
                ? "not-allowed"
                : "pointer",
            opacity:
              !command.trim() || submitting || running || !experimentId
                ? 0.5
                : 1,
          }}
        >
          {submitting || running ? (
            <RefreshCw size={14} className="op-spin" />
          ) : (
            <Play size={14} />
          )}
          {running ? "เอเจนต์กำลังทำงาน..." : "สั่งเอเจนต์ (AUTO)"}
        </button>

        {running && (
          <button
            type="button"
            onClick={() => void stop()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: 7,
              border: "1px solid rgba(224,163,62,0.5)",
              background: "rgba(224,163,62,0.1)",
              color: "#e0a33e",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <Square size={12} />
            หยุด
          </button>
        )}

        {runId !== null && (
          <Link
            href={`/runs/${runId}`}
            style={{
              fontSize: 11,
              color: "#2de2e6",
              textDecoration: "none",
              marginLeft: "auto",
            }}
          >
            ดูหน้ารันเต็ม #{runId} →
          </Link>
        )}
      </div>

      {optionsError && (
        <p style={{ color: "#e0a33e", fontSize: 12, marginTop: 10 }}>
          <AlertTriangle size={13} style={{ verticalAlign: "-2px" }} />{" "}
          {optionsError}
        </p>
      )}
      {error && (
        <p style={{ color: "#f87171", fontSize: 12, marginTop: 10 }}>
          <AlertTriangle size={13} style={{ verticalAlign: "-2px" }} /> {error}
        </p>
      )}

      {/* Live run view */}
      {runId !== null && (
        <div
          style={{
            marginTop: 14,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingTop: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              Run #{runId}{" "}
              <em style={{ color: tone.color, fontStyle: "normal" }}>
                {tone.label}
              </em>
            </span>
            <span style={{ fontSize: 11, color: "var(--dim, #8a8f99)" }}>
              {logs.length} log · {pctFindings} findings
            </span>
          </div>

          {/* live log feed */}
          <ul
            ref={logBoxRef}
            style={{
              listStyle: "none",
              margin: 0,
              padding: "8px 10px",
              maxHeight: 180,
              overflowY: "auto",
              background: "#070810",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.06)",
              fontFamily: "var(--font-mono), monospace",
              fontSize: 11,
            }}
          >
            {logs.length === 0 ? (
              <li style={{ color: "var(--dim, #8a8f99)" }}>
                {running ? "เอเจนต์กำลังเริ่มทำงาน..." : "ยังไม่มี log"}
              </li>
            ) : (
              logs.map((l) => (
                <li
                  key={l.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    padding: "2px 0",
                    color:
                      l.level === "error"
                        ? "#f87171"
                        : l.level === "warn"
                          ? "#e0a33e"
                          : "#c9ccd3",
                  }}
                >
                  <span style={{ color: "#55606e", flex: "none" }}>
                    {l.createdAt ? l.createdAt.slice(11, 19) : ""}
                  </span>
                  <span style={{ minWidth: 0, wordBreak: "break-word" }}>
                    {l.message}
                  </span>
                </li>
              ))
            )}
          </ul>

          {/* final output + recommendations */}
          {FINAL.has(String(status)) && (
            <div style={{ marginTop: 10 }}>
              {output ? (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    background: "#070810",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 8,
                    padding: "10px 12px",
                    fontSize: 12,
                    color: "#eaeaea",
                    margin: 0,
                  }}
                >
                  {output}
                </pre>
              ) : (
                <p style={{ fontSize: 12, color: "var(--dim, #8a8f99)" }}>
                  เอเจนต์ทำงานเสร็จ — ดูรายละเอียด/ผลการประเมินในหน้ารันเต็ม
                </p>
              )}
              <p
                style={{
                  fontSize: 11,
                  color: "#3ad29f",
                  marginTop: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <CheckCircle2 size={13} />
                เป้าหมายที่เอเจนต์พบถูกบันทึกลงฐานข้อมูลอัตโนมัติ —{" "}
                <Link href="/ports" style={{ color: "#2de2e6" }}>
                  <Database
                    size={12}
                    style={{ verticalAlign: "-2px", marginRight: 2 }}
                  />
                  ดูที่หน้า Ports
                </Link>
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default MapAutoAgent;
