"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Terminal as TerminalIcon,
  BookOpen,
  Search,
  RefreshCw,
  XCircle,
  ArrowRight,
  Zap,
} from "lucide-react";

import { Navbar } from "@/components/hud/Navbar";
import { Sidebar } from "@/components/hud/Sidebar";
import { useDarkAgiTerminal } from "@/components/dark-agi/useDarkAgiTerminal";
import { TerminalPanel } from "@/components/dark-agi/TerminalPanel";
import { CopyButton } from "@/components/dark-agi/CopyButton";
import { NmapAdvancedForm } from "@/components/dark-agi/NmapAdvancedForm";
import "@/styles/ops.css";

// Operations with required fields the plain "รันทันที" button can't fill in
// (just toolId/operationId, no input) — these get the dedicated form instead.
const NMAP_ADVANCED_OPS = new Set(["os-fingerprint", "script-scan"]);
const NMAP_MAX_RATE_CAP = 1000; // mirrors engine config.darkAgi.maxRateCap default

// ── Types mirroring DARK AGI's own contract (execution.contract.ts) ────────

type Risk = "low" | "moderate" | "high";

type Operation = {
  toolId: string;
  operationId: string;
  title: string;
  description: string;
  category: string;
  risk: Risk;
  requiresApproval: boolean;
  targetKind: "network" | "local";
  available: boolean;
  unavailableReason: string | null;
};

type RemoteHost = {
  id: string;
  host: string;
  label: string | null;
  status: "PENDING_APPROVAL" | "APPROVED" | "REVOKED";
  hasCredential: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** "*-remote" operations need an explicit, pre-registered Remote Host with a
 * credential on file AND operator approval — Scope alone never covers this
 * (Scope says a target may be touched at all; a Remote Host additionally
 * says this platform may run PowerShell ON it). Never auto-resolved. */
function isRemoteOp(op: Operation): boolean {
  return op.operationId.endsWith("-remote");
}

function usableRemoteHosts(hosts: RemoteHost[]): RemoteHost[] {
  return hosts.filter((h) => h.status === "APPROVED" && h.hasCredential);
}

/** The actual, ready-to-run command for an operation — DARK AGI's own
 * canonical `toolId:operationId` syntax (not a description, not a title).
 * Works unmodified in both Terminal modes: DIRECT submits it as-is, and AI
 * mode recognizes this exact form as DARK AGI's own command language, so it
 * never needs guessing. No target is appended — for a "network" operation
 * the backend auto-resolves it from the operator's one currently-approved
 * Scope when none is given; a human adds "on <host>" themselves only when
 * they mean a specific host, never a placeholder we invented. */
function exampleCommand(op: Operation): string {
  return `${op.toolId}:${op.operationId}`;
}

function riskClass(risk: string): string {
  const r = risk.toLowerCase();
  if (r === "high") return "op-pill op-pill-bad";
  if (r === "moderate") return "op-pill op-pill-warn";
  if (r === "low") return "op-pill op-pill-ok";
  return "op-pill op-pill-mute";
}

export default function DarkAgiPage() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [opsLoading, setOpsLoading] = useState(true);
  const [opsError, setOpsError] = useState("");
  const [search, setSearch] = useState("");
  const [remoteHosts, setRemoteHosts] = useState<RemoteHost[]>([]);

  const terminal = useDarkAgiTerminal();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/dark-agi/remote-hosts", { cache: "no-store", signal: controller.signal })
      .then((res) => res.json())
      .then((payload: unknown) => {
        if (isRecord(payload) && Array.isArray(payload.items)) {
          setRemoteHosts(payload.items as RemoteHost[]);
        }
      })
      .catch(() => {
        // Non-fatal: *-remote ops just show as unavailable below, same as
        // any other reachability failure.
      });
    return () => controller.abort();
  }, []);

  const hasUsableRemoteHost = usableRemoteHosts(remoteHosts).length > 0;

  // Command reference: refetched fresh every time this page loads — never
  // baked into source, since DARK AGI's own catalogue changes over time.
  const loadOperations = useCallback(async (signal?: AbortSignal) => {
    setOpsLoading(true);
    setOpsError("");
    try {
      const res = await fetch("/api/dark-agi/operations", { cache: "no-store", signal });
      const payload: unknown = await res.json();
      if (!res.ok) {
        const message =
          isRecord(payload) && typeof payload.message === "string"
            ? payload.message
            : `โหลดรายการคำสั่งไม่สำเร็จ (${res.status})`;
        throw new Error(message);
      }
      const items =
        isRecord(payload) && Array.isArray(payload.items) ? (payload.items as Operation[]) : [];
      setOperations(items);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setOpsError(err instanceof Error ? err.message : "โหลดรายการคำสั่งไม่สำเร็จ");
    } finally {
      if (!signal?.aborted) setOpsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadOperations(controller.signal);
    return () => controller.abort();
  }, [loadOperations]);

  const filteredOperations = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return operations;
    return operations.filter((op) =>
      // Include the colon form explicitly — it's exactly what the copy
      // button and the command box show, so searching with it (as copied)
      // must match, not just the space-joined fields below.
      [`${op.toolId}:${op.operationId}`, op.toolId, op.operationId, op.title, op.description, op.category]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [operations, search]);

  function fillExample(op: Operation) {
    terminal.setMode("ai");
    terminal.setInput(exampleCommand(op));
  }

  return (
    <div className="shell" style={{ background: "#090a0f" }}>
      <Sidebar online={!opsError} />

      <div className="main flex min-w-0 flex-col">
        <Navbar online={!opsError} title="DARK AGI TERMINAL" link="DARK AGI API" />

        <main className="op-page">
          <header className="op-hero">
            <div>
              <div className="op-kicker">
                <TerminalIcon size={13} />
                DARK AGI / HUMAN-OPERATED EXECUTION
              </div>
              <h1 className="op-h1">
                DARK AGI <b>Terminal</b>
              </h1>
              <p className="op-sub">
                สั่งงาน DARK AGI Windows Execution API โดยตรง — เฉพาะผู้ปฏิบัติงาน
                (มนุษย์) เท่านั้น เอเจนต์ไม่เรียกหน้านี้โดยอัตโนมัติ
              </p>
            </div>
          </header>

          {opsError && (
            <div role="alert" className="op-alert">
              <XCircle />
              {opsError}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(280px, 380px) minmax(0, 1fr)",
              gap: 16,
              alignItems: "start",
            }}
          >
            {/* ── Command reference ───────────────────────────────────── */}
            <section
              className="op-panel"
              style={{ maxHeight: 640, display: "flex", flexDirection: "column" }}
            >
              <div className="op-head" style={{ flexWrap: "nowrap" }}>
                <h2 className="op-title" style={{ minWidth: 0 }}>
                  <span className="op-chip">
                    <BookOpen />
                  </span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    COMMAND REFERENCE
                  </span>
                </h2>
                <button
                  type="button"
                  className="op-btn op-btnXs"
                  onClick={() => void loadOperations()}
                  disabled={opsLoading}
                  style={{ flex: "none" }}
                >
                  <RefreshCw className={opsLoading ? "op-spin" : ""} size={12} />
                  REFRESH
                </button>
              </div>

              <div
                className="op-titleSub"
                style={{ padding: "8px 16px 0" }}
              >
                {operations.length} operations · กดปุ่มเพื่อใส่ตัวอย่างคำสั่ง
              </div>

              <div style={{ padding: "10px 16px 0" }}>
                <label className="op-search" style={{ width: "100%" }}>
                  <Search />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="ค้นหา tool, operation, คำอธิบาย..."
                    aria-label="Search operations"
                  />
                </label>
              </div>

              <div
                className="op-dim"
                style={{
                  margin: "10px 16px 0",
                  padding: "8px 10px",
                  fontSize: 10,
                  lineHeight: 1.6,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 6,
                }}
              >
                <b style={{ color: "#9ef3f5" }}>แก้ไขก่อน (AI)</b> = เติมคำสั่งลงช่อง Terminal
                ให้แก้ไข/เพิ่มรายละเอียดก่อนกด Run เอง (ต้องตั้งโมเดลใน Model Registry)
                <br />
                <b style={{ color: "#8ff0bb" }}>รันทันที (ไม่ใช้ AI)</b> = ยิงงานทันที
                ด้วย operation ที่เลือกไว้แน่นอน ไม่ผ่าน AI เลย
              </div>

              <div style={{ overflowY: "auto", padding: "10px 16px 16px" }}>
                {opsLoading ? (
                  <div className="op-empty op-loading">
                    <RefreshCw className="op-spin" size={16} />
                    LOADING...
                  </div>
                ) : filteredOperations.length === 0 ? (
                  <div className="op-empty">
                    <p className="op-emptyTitle">ไม่พบ operation</p>
                  </div>
                ) : (
                  filteredOperations.map((op) => {
                    const remoteBlocked = isRemoteOp(op) && !hasUsableRemoteHost;
                    const usable = op.available && !remoteBlocked;
                    return (
                    <div
                      key={`${op.toolId}:${op.operationId}`}
                      style={{
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 8,
                        padding: "8px 10px",
                        marginBottom: 6,
                        opacity: usable ? 1 : 0.45,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span style={{ fontWeight: 700, fontSize: 12.5 }}>{op.title}</span>
                        <span className={riskClass(op.risk)} style={{ fontSize: 9 }}>
                          {op.risk.toUpperCase()}
                        </span>
                      </div>
                      <div className="op-mono op-dim" style={{ fontSize: 10.5, marginTop: 2 }}>
                        {op.toolId}:{op.operationId}
                        {op.requiresApproval ? " · needs approval" : ""}
                      </div>
                      <div className="op-dim" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
                        {op.description}
                      </div>
                      {!op.available && (
                        <div style={{ fontSize: 10, marginTop: 4, color: "#ff9aa5" }}>
                          {op.unavailableReason ?? "ยังไม่พร้อมใช้งานบนเครื่องนี้"}
                        </div>
                      )}
                      {remoteBlocked && (
                        <div style={{ fontSize: 10, marginTop: 4, color: "#ff9aa5" }}>
                          ต้องมี Remote Host ที่อนุมัติแล้วและตั้งค่า credential ไว้อย่างน้อย 1
                          เครื่อง (ตอนนี้ยังไม่มี) — ไปตั้งค่าที่ DARK AGI console →
                          Remote Hosts ก่อน
                        </div>
                      )}

                      {/* The actual command text — copyable, and editable
                          once it's in the Terminal. No target placeholder:
                          for a network operation, leaving it out lets DARK
                          AGI auto-resolve the operator's one active Scope;
                          add "on <host>" yourself only to name one directly. */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 8,
                          background: "#05060a",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 6,
                          padding: "6px 8px",
                        }}
                      >
                        <code
                          className="op-mono"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 11,
                            color: "#9ef3f5",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {exampleCommand(op)}
                        </code>
                        <CopyButton text={exampleCommand(op)} label="" />
                      </div>
                      {op.targetKind === "network" && (
                        <div
                          className="op-dim"
                          style={{ fontSize: 9.5, marginTop: 4, lineHeight: 1.4 }}
                        >
                          ไม่ระบุเป้าหมาย = ใช้ Scope ที่เปิดอยู่อัตโนมัติ — หรือพิมพ์ต่อท้ายเอง
                          เช่น &quot;on 10.0.0.5&quot;
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <button
                          type="button"
                          onClick={() => fillExample(op)}
                          disabled={!usable}
                          className="op-btn op-btnXs"
                          style={{ flex: 1, justifyContent: "center" }}
                          title="เติมคำสั่งลงช่อง Terminal ให้แก้ไขก่อนกด Run เอง — DARK AGI ใช้ AI ตีความ (ต้องตั้งโมเดลใน Model Registry ก่อน)"
                        >
                          <ArrowRight size={12} />
                          แก้ไขก่อน (AI)
                        </button>
                        <button
                          type="button"
                          onClick={() => terminal.runDirect(op.toolId, op.operationId, op.title)}
                          disabled={!usable || terminal.submitting}
                          className="op-btn op-btnOk op-btnXs"
                          style={{ flex: 1, justifyContent: "center" }}
                          title="รันทันทีด้วย operation ที่เลือกไว้แน่นอนแล้ว — ไม่ผ่าน AI เลย ไม่ต้องตั้งโมเดล"
                        >
                          <Zap size={12} />
                          รันทันที (ไม่ใช้ AI)
                        </button>
                      </div>

                      {op.toolId === "nmap" && NMAP_ADVANCED_OPS.has(op.operationId) && (
                        <NmapAdvancedForm
                          operationId={op.operationId as "os-fingerprint" | "script-scan"}
                          maxRateCap={NMAP_MAX_RATE_CAP}
                          disabled={!usable || terminal.submitting}
                          onRun={(input) =>
                            terminal.runDirect(op.toolId, op.operationId, op.title, input)
                          }
                        />
                      )}
                    </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* ── Terminal ─────────────────────────────────────────────── */}
            <section
              className="op-panel"
              style={{ display: "flex", flexDirection: "column", height: 640 }}
            >
              <div className="op-head">
                <h2 className="op-title">
                  <span className="op-chip">
                    <TerminalIcon />
                  </span>
                  <span>
                    TERMINAL
                    <span className="op-titleSub">
                      พิมพ์คำสั่งแล้วกด Run — ระบบจะตีความและส่งเป็น job เดียว
                    </span>
                  </span>
                </h2>
              </div>

              <div style={{ flex: 1, minHeight: 0, display: "flex", padding: 16 }}>
                <TerminalPanel
                  log={terminal.log}
                  input={terminal.input}
                  setInput={terminal.setInput}
                  mode={terminal.mode}
                  setMode={terminal.setMode}
                  search={terminal.search}
                  setSearch={terminal.setSearch}
                  onClear={terminal.clearLog}
                  submitting={terminal.submitting}
                  onSubmit={terminal.submit}
                  minHeight={420}
                />
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
