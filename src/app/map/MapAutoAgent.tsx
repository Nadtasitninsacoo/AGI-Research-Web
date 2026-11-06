"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import {
  Bot,
  Play,
  RefreshCw,
  Database,
  AlertTriangle,
  CheckCircle2,
  Square,
  ArrowRight,
} from "lucide-react";

import { listExecutionOptions } from "@/app/execute/options-actions";
import { createRunLocal, cancelRunAction } from "@/app/runs/actions";
import type { Experiment } from "@/lib/execution/types";
import { ReconGlobe } from "./ReconGlobe";

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
  "osint_lookup 8.8.8.8 แล้ว save_targets พอร์ตที่เปิดลงฐานข้อมูล",
  "dns_lookup + tls_inspect ของ example.com แล้ว record_finding สรุปความเสี่ยง",
  "http_probe + tech_fingerprint โฮสต์เป้าหมาย แล้วแนะนำแนวทาง hardening",
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

  const pill: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 9px",
    borderRadius: 6,
    border: "1px solid rgba(45,226,230,0.35)",
    background: "rgba(45,226,230,0.08)",
    color: "#2de2e6",
    fontSize: 10.5,
    textDecoration: "none",
  };

  return (
    <section
      className="auto-recon-card"
      style={{
        border: "1px solid rgba(45,226,230,0.3)",
        borderRadius: 12,
        padding: "16px 18px",
        marginBottom: 16,
      }}
    >
      {/* Decorative blue planet + orbiting stars (Overview-style backdrop). */}
      <div className="recon-planet" aria-hidden="true">
        <ReconGlobe />
        <div className="orbit orbit-1"><span className="star" /></div>
        <div className="orbit orbit-2"><span className="star" /></div>
        <div className="orbit orbit-3"><span className="star" /></div>
      </div>

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
            color: "#e0a33e",
            border: "1px solid rgba(224,163,62,0.4)",
            background: "rgba(224,163,62,0.08)",
            borderRadius: 6,
            padding: "3px 8px",
          }}
          title="scope.mjs ถูกถอดออก และมี auto-approve bypass — ระบบไม่ได้บังคับขอบเขต"
        >
          ไม่จำกัดขอบเขต · guardrails ถอดออก
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
          className={`auto-recon-run${running ? " is-working" : ""}`}
          style={{
            position: "relative",
            overflow: "hidden",
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
            className="auto-recon-fulllink"
            style={{ marginLeft: "auto" }}
          >
            <span>
              ดูหน้ารันเต็ม <strong>#{runId}</strong>
            </span>
            <ArrowRight size={13} className="auto-recon-fulllink-arrow" />
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

          {/* While running: compact live log. When done: tidy result card. */}
          {!FINAL.has(String(status)) ? (
            <ul
              ref={logBoxRef}
              style={{
                listStyle: "none",
                margin: 0,
                padding: "7px 10px",
                maxHeight: 140,
                overflowY: "auto",
                background: "#070810",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.06)",
                fontFamily: "var(--font-mono), monospace",
                fontSize: 10.5,
              }}
            >
              {logs.length === 0 ? (
                <li style={{ color: "var(--dim, #8a8f99)" }}>
                  เอเจนต์กำลังเริ่มทำงาน...
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
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {output ? (
                <div
                  style={{
                    background: "#070810",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "5px 10px",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      fontSize: 9,
                      letterSpacing: "0.14em",
                      color: "var(--dim, #8a8f99)",
                      fontFamily: "var(--font-mono), monospace",
                    }}
                  >
                    <span>OUTPUT</span>
                    <span>
                      {logs.length} log · {pctFindings} findings
                    </span>
                  </div>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      margin: 0,
                      padding: "8px 11px",
                      maxHeight: 132,
                      overflow: "auto",
                      fontSize: 11,
                      lineHeight: 1.55,
                      color: "#d7dae0",
                    }}
                  >
                    {output}
                  </pre>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: "var(--dim, #8a8f99)", margin: 0 }}>
                  เอเจนต์ทำงานเสร็จ — ดูรายละเอียดในหน้ารันเต็ม
                </p>
              )}

              {/* tidy footer: saved note + thin pill buttons */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 10.5,
                    color: "#3ad29f",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <CheckCircle2 size={12} />
                  บันทึกเป้าหมายลง DB อัตโนมัติ
                </span>
                <Link href="/recon?tab=ports" style={pill}>
                  <Database size={11} />
                  Ports
                </Link>
                <Link href="/recon" style={pill}>
                  <Database size={11} />
                  Recon
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default MapAutoAgent;
