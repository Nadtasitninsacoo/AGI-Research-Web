"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  KeyRound,
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Square,
  FileText,
} from "lucide-react";

import { listExecutionOptions } from "@/app/execute/options-actions";
import { createRunLocal, cancelRunAction } from "@/app/runs/actions";
import type { Experiment } from "@/lib/execution/types";

type LogRow = { id: number; level: string; message: string; createdAt: string };
type Snapshot = {
  run: { id: number; status: string; metrics?: { output?: string } | null };
  logs: LogRow[];
  logsTotal: number;
  evaluations: unknown[];
} | null;

const FINAL = new Set(["succeeded", "failed", "needs_input", "cancelled"]);

function tone(status: string | undefined) {
  switch ((status ?? "").toLowerCase()) {
    case "running":
      return { label: "● กำลังกู้", color: "#2de2e6" };
    case "queued":
      return { label: "อยู่ในคิว", color: "#e0a33e" };
    case "succeeded":
      return { label: "✓ เสร็จ", color: "#3ad29f" };
    case "failed":
      return { label: "✕ ล้มเหลว", color: "#f87171" };
    case "needs_input":
      return { label: "ต้องการข้อมูลเพิ่ม", color: "#e0a33e" };
    case "cancelled":
      return { label: "ยกเลิก", color: "#8a8f99" };
    default:
      return { label: (status ?? "—").toUpperCase(), color: "#8a8f99" };
  }
}

export function UsbAuthorizedRecovery() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [experimentId, setExperimentId] = useState("");

  // Authorization record (required before anything runs)
  const [idVerified, setIdVerified] = useState(false);
  const [owner, setOwner] = useState("");
  const [reference, setReference] = useState("");
  const [device, setDevice] = useState("");

  // Material the owner handed over (hash / encrypted container contents)
  const [material, setMaterial] = useState("");

  const [runId, setRunId] = useState<number | null>(null);
  const [snap, setSnap] = useState<Snapshot>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const logRef = useRef<HTMLUListElement | null>(null);

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
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        if (FINAL.has(String(data.run.status))) clearInterval(timer);
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

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [snap]);

  const authReady =
    idVerified && owner.trim() !== "" && reference.trim() !== "";
  const canSubmit =
    authReady && material.trim() !== "" && !!experimentId && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setError("");
    setSnap(null);
    setRunId(null);
    setSubmitting(true);

    const authorization = {
      idVerified: true,
      owner: owner.trim(),
      reference: reference.trim(),
      device: device.trim() || "(unspecified)",
      at: new Date().toISOString(),
    };

    const prompt = [
      "Authorized password recovery request.",
      `The device owner was identity-verified (ID checked) and authorized this recovery. Owner: ${authorization.owner}. Consent reference: ${authorization.reference}. Device: ${authorization.device}.`,
      "Audit/recover ONLY the material provided below (which the owner handed over). Use hashcat or john as appropriate. Do not access or act on any other system or connected device.",
      "Report whether the credential is weak, the recovered value if found, and recommend a stronger password policy.",
      "",
      "MATERIAL:",
      material.trim(),
    ].join("\n");

    try {
      const id = await createRunLocal({
        experimentId,
        params: { prompt, authorization, source: "usb-authorized-recovery" },
      });
      setRunId(Number(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "เริ่มงานไม่สำเร็จ");
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
  const t = tone(status);
  const running = runId !== null && !FINAL.has(String(status ?? "queued"));
  const output = snap?.run?.metrics?.output;
  const logs = snap?.logs ?? [];

  const field: CSSProperties = {
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0a0b10",
    color: "#eaeaea",
    fontSize: 12,
    outline: "none",
  };
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
      style={{
        border: "1px solid rgba(45,226,230,0.3)",
        borderRadius: 12,
        background: "#0c0e15",
        padding: "16px 18px",
        marginBottom: 16,
      }}
    >
      <header
        style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}
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
          <KeyRound size={15} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>AUTHORIZED RECOVERY</div>
          <div
            style={{
              fontSize: 11,
              color: "var(--dim, #8a8f99)",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            กู้/ประเมินรหัสผ่าน — เฉพาะเครื่องที่เจ้าของยินยอม (ตรวจบัตรแล้ว) + ผ่าน approval
          </div>
        </div>
        <span
          style={{
            fontSize: 10,
            color: "#e0a33e",
            border: "1px solid rgba(224,163,62,0.4)",
            borderRadius: 6,
            padding: "3px 8px",
          }}
        >
          consent required
        </span>
      </header>

      {/* Authorization record */}
      <div
        style={{
          border: "1px solid rgba(224,163,62,0.25)",
          borderRadius: 9,
          padding: "12px",
          marginBottom: 12,
          background: "rgba(224,163,62,0.04)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            color: "#e0a33e",
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <ShieldCheck size={12} />
          บันทึกการอนุญาต (จำเป็น)
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: 12,
            color: "#eaeaea",
            cursor: "pointer",
            marginBottom: 10,
          }}
        >
          <input
            type="checkbox"
            checked={idVerified}
            onChange={(e) => setIdVerified(e.target.checked)}
            disabled={running}
            style={{ marginTop: 2 }}
          />
          <span>
            ยืนยันว่า <b>ตรวจบัตรประชาชนของเจ้าของเครื่องแล้ว</b> และเจ้าของยินยอมให้กู้รหัส
            (ระบบไม่เก็บรูปบัตร — เก็บเฉพาะเลขอ้างอิง)
          </span>
        </label>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 8,
          }}
        >
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            disabled={running}
            placeholder="ชื่อเจ้าของเครื่อง *"
            style={field}
          />
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            disabled={running}
            placeholder="เลขอ้างอิง/ใบยินยอม *"
            style={field}
          />
          <input
            value={device}
            onChange={(e) => setDevice(e.target.value)}
            disabled={running}
            placeholder="อุปกรณ์ (เช่น iPhone 13 ของ...)"
            style={field}
          />
        </div>
      </div>

      {/* Material */}
      <textarea
        value={material}
        onChange={(e) => setMaterial(e.target.value)}
        disabled={running}
        rows={3}
        placeholder="วางวัสดุที่เจ้าของมอบให้กู้ที่นี่ — เช่น hash (NTLM/bcrypt/…), ไฟล์ encrypted ที่ export มา, หรือ path ของ container"
        style={{
          width: "100%",
          resize: "vertical",
          minHeight: 64,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "#0a0b10",
          color: "#eaeaea",
          fontSize: 12,
          fontFamily: "var(--font-mono), monospace",
          outline: "none",
          marginBottom: 10,
        }}
      />

      <div
        style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
      >
        <select
          value={experimentId}
          onChange={(e) => setExperimentId(e.target.value)}
          disabled={running || experiments.length === 0}
          style={field}
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
          disabled={!canSubmit || running}
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
            letterSpacing: "0.08em",
            cursor: !canSubmit || running ? "not-allowed" : "pointer",
            opacity: !canSubmit || running ? 0.5 : 1,
          }}
        >
          {submitting || running ? (
            <RefreshCw size={14} className="op-spin" />
          ) : (
            <Play size={14} />
          )}
          {running ? "เอเจนต์กำลังกู้..." : "เริ่มกู้ (Authorized)"}
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

      {!authReady && (
        <p style={{ fontSize: 11, color: "var(--dim, #8a8f99)", marginTop: 8 }}>
          ต้องยืนยันการตรวจบัตร + กรอกชื่อเจ้าของและเลขอ้างอิงก่อน จึงจะเริ่มได้
        </p>
      )}
      {error && (
        <p style={{ color: "#f87171", fontSize: 12, marginTop: 10 }}>
          <AlertTriangle size={13} style={{ verticalAlign: "-2px" }} /> {error}
        </p>
      )}

      {/* Live run / result */}
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
              <em style={{ color: t.color, fontStyle: "normal" }}>{t.label}</em>
            </span>
            <span style={{ fontSize: 10.5, color: "var(--dim, #8a8f99)" }}>
              consent: {reference || "—"} · {logs.length} log
            </span>
          </div>

          {!FINAL.has(String(status)) ? (
            <ul
              ref={logRef}
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
                      justifyContent: "space-between",
                      padding: "5px 10px",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      fontSize: 9,
                      letterSpacing: "0.14em",
                      color: "var(--dim, #8a8f99)",
                      fontFamily: "var(--font-mono), monospace",
                    }}
                  >
                    <span>ผลการกู้</span>
                    <span>{logs.length} log</span>
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
                <p
                  style={{ fontSize: 12, color: "var(--dim, #8a8f99)", margin: 0 }}
                >
                  เอเจนต์ทำงานเสร็จ — ดูรายละเอียดในหน้ารันเต็ม
                </p>
              )}
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
                  บันทึกการอนุญาตแนบกับ run (audit trail)
                </span>
                <Link href={`/runs/${runId}`} style={pill}>
                  <FileText size={11} />
                  audit trail
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default UsbAuthorizedRecovery;
