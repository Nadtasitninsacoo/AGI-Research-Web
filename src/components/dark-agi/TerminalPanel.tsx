"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Send, Sparkles, Zap, Search, Trash2 } from "lucide-react";
import {
  usePendingScopePick,
  useAutoApprove,
  useEngineState,
  emergencyStop,
  resumeEngine,
} from "./useDarkAgiTerminal";
import { AUTO_APPROVE_DEFAULT_MIN, AUTO_APPROVE_DURATIONS_MIN, formatRemaining } from "./autoApprove";
import type { LogEntry, TerminalMode } from "./useDarkAgiTerminal";
import { JobBanner } from "./JobBanner";
import { ScopeTargetPicker } from "./ScopeTargetPicker";
import { ConfirmModal } from "@/components/hud/ConfirmModal";

/** The terminal's log + input, with no outer chrome — the full /dark-agi page
 * and the floating Navbar widget each wrap this in their own container. */
export function TerminalPanel({
  log,
  input,
  setInput,
  mode,
  setMode,
  search,
  setSearch,
  onClear,
  submitting,
  onSubmit,
  minHeight = 280,
}: {
  log: LogEntry[];
  input: string;
  setInput: (value: string) => void;
  mode: TerminalMode;
  setMode: (mode: TerminalMode) => void;
  search: string;
  setSearch: (value: string) => void;
  onClear: () => void;
  submitting: boolean;
  onSubmit: () => void;
  minHeight?: number;
}) {
  const logBoxRef = useRef<HTMLDivElement | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const scopePick = usePendingScopePick();
  const auto = useAutoApprove();
  const [autoMin, setAutoMin] = useState<number>(AUTO_APPROVE_DEFAULT_MIN);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (auto.until === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [auto.until]);
  const autoLeft = auto.until === null ? null : auto.until - now;
  const engine = useEngineState();
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    logBoxRef.current?.scrollTo({ top: logBoxRef.current.scrollHeight });
  }, [log, scopePick.pick]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        role="tablist"
        aria-label="Terminal mode"
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 8,
          padding: 3,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          flex: "none",
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "ai"}
          onClick={() => setMode("ai")}
          className="op-btn op-btnXs"
          title="พิมพ์เป็นภาษาคนได้เลย — DARK AGI ใช้ AI ตีความเป็น operation (ต้องตั้งโมเดลใน Model Registry)"
          style={{
            flex: 1,
            justifyContent: "center",
            border: mode === "ai" ? "1px solid var(--red-hot, #f81e36)" : "1px solid transparent",
            background: mode === "ai" ? "rgba(248,30,54,0.12)" : "transparent",
            color: mode === "ai" ? "#fff" : undefined,
          }}
        >
          <Sparkles size={12} />
          AI
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "direct"}
          onClick={() => setMode("direct")}
          className="op-btn op-btnXs"
          title="พิมพ์ toolId:operationId ตรงๆ เช่น nmap:host-discovery — ไม่ผ่าน AI เลย"
          style={{
            flex: 1,
            justifyContent: "center",
            border: mode === "direct" ? "1px solid #3fce83" : "1px solid transparent",
            background: mode === "direct" ? "rgba(63,206,131,0.12)" : "transparent",
            color: mode === "direct" ? "#fff" : undefined,
          }}
        >
          <Zap size={12} />
          DIRECT (ไม่ใช้ AI)
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 8, flex: "none" }}>
        <label
          className="op-search"
          style={{ flex: 1, width: "auto", height: 28, background: "rgba(255,255,255,0.03)" }}
        >
          <Search size={13} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาในประวัติ..."
            aria-label="Search terminal history"
          />
        </label>
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="op-btn op-btnXs"
          title="ล้างประวัติทั้งหมด"
        >
          <Trash2 size={12} />
          CLEAR
        </button>
      </div>

      {/* แถวเดียว: AUTO-APPROVE (ซ้าย ยืดได้) + EMERGENCY STOP (ขวา บาง) */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 8, marginBottom: 8, flex: "none" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "nowrap",
          flex: 1,
          minWidth: 0,
          padding: "2px 8px",
          minHeight: 30,
          borderRadius: 8,
          fontSize: 12,
          border: `1px solid ${auto.until !== null ? "rgba(255,176,32,0.6)" : "rgba(255,255,255,0.08)"}`,
          background: auto.until !== null ? "rgba(255,176,32,0.08)" : "rgba(255,255,255,0.03)",
        }}
      >
        {auto.until === null ? (
          <>
            <span style={{ color: "#8a8f99", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title="อนุมัติเองเฉพาะ nmap port-inventory / service-identification / os-fingerprint — งานเสี่ยงสูงอื่นยังต้องกดเอง">
              AUTO-APPROVE: ปิด
            </span>
            <select
              value={autoMin}
              onChange={(e) => setAutoMin(Number(e.target.value))}
              aria-label="ระยะเวลา auto-approve"
              style={{
                width: "auto",
                flex: "none",
                height: 26,
                background: "#0b0d12",
                color: "#e8e8ee",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 6,
                padding: "0 6px",
                fontSize: 12,
              }}
            >
              {AUTO_APPROVE_DURATIONS_MIN.map((m) => (
                <option key={m} value={m}>{m} นาที</option>
              ))}
            </select>
            <button type="button" className="op-btn op-btnXs" onClick={() => auto.arm(autoMin)}>
              ⚡ เปิด
            </button>
          </>
        ) : (
          <>
            <span style={{ color: "#ffb020", fontWeight: 700 }}>
              ⚡ AUTO-APPROVE เปิดอยู่ — เหลือ {formatRemaining(autoLeft ?? 0)}
            </span>
            <button type="button" className="op-btn op-btnXs" onClick={auto.disarm}>
              ■ ปิดทันที
            </button>
          </>
        )}
      </div>

      {/* หยุดฉุกเฉิน: ขึ้นเฉพาะตอนมีงานรัน/คิวอยู่ — กดแล้วหยุดทันทีไม่ถามซ้ำ */}
      {engine && engine.active > 0 && !engine.paused && (
        <button
          type="button"
          disabled={stopping}
          onClick={async () => {
            setStopping(true);
            try {
              await emergencyStop();
            } finally {
              setStopping(false);
            }
          }}
          style={{
            flex: "none",
            padding: "0 12px",
            minHeight: 30,
            fontSize: 12,
            whiteSpace: "nowrap",
            border: "1px solid #ff2d46",
            borderRadius: 8,
            background: "linear-gradient(180deg,#ff2d46,#a50f1e)",
            color: "#fff",
            fontWeight: 800,
            letterSpacing: "0.05em",
            cursor: stopping ? "wait" : "pointer",
            boxShadow: "0 0 10px rgba(255,45,70,0.4)",
          }}
          title={`หยุดทุกงานและ process ที่กำลังรันทันที แล้วพักเครื่องยนต์ (${engine.active} งานกำลังรัน/รอคิว)`}
        >
          🛑 STOP ({engine.active})
        </button>
      )}
      </div>

      {engine?.paused && (
        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 8,
            padding: "8px 10px",
            border: "1px solid #ff2d46",
            borderRadius: 8,
            background: "rgba(255,45,70,0.1)",
            fontSize: 12,
          }}
        >
          <span style={{ color: "#ff9aa5", fontWeight: 700 }}>
            🛑 ENGINE PAUSED — ปฏิเสธงานใหม่ทั้งหมด{engine.reason ? ` (${engine.reason})` : ""}
          </span>
          <button type="button" className="op-btn op-btnOk op-btnXs" onClick={() => void resumeEngine()}>
            ▶ เดินเครื่องต่อ
          </button>
        </div>
      )}

      <ConfirmModal
        open={confirmClear}
        title="ล้างประวัติ Terminal ทั้งหมด?"
        body="ย้อนกลับไม่ได้ — ประวัติที่เก็บไว้ในเครื่องนี้จะหายทั้งหมด"
        confirmLabel="ล้างประวัติ"
        cancelLabel="ยกเลิก"
        tone="danger"
        zIndex={1000}
        onConfirm={() => {
          onClear();
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />

      <div
        ref={logBoxRef}
        className="op-mono"
        style={{
          // flex-basis 0 + a modest floor: the log shrinks to make room for the
          // control bars above it instead of pushing the input row off the card.
          flex: "1 1 0",
          overflowY: "auto",
          background: "#05060a",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          padding: 12,
          fontSize: 12.5,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          minHeight: Math.min(minHeight, 160),
        }}
      >
        {log.map((entry) => {
          if (entry.kind === "job") {
            // Re-key on status change so the CSS "flash" animation replays
            // on every transition (QUEUED → RUNNING → SUCCEEDED/…), not just
            // on first mount.
            return <JobBanner key={`${entry.id}-${entry.job.status}`} job={entry.job} />;
          }
          if (entry.kind === "banner") {
            return (
              <div
                key={entry.id}
                style={{
                  marginBottom: 8,
                  overflowX: "auto",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    color: "#9ef3f5",
                    fontSize: 10,
                    lineHeight: 1.3,
                    whiteSpace: "pre",
                  }}
                >
                  {entry.text}
                </pre>
              </div>
            );
          }
          return (
            <div
              key={entry.id}
              style={{
                marginBottom: 8,
                color:
                  entry.kind === "error"
                    ? "#ff9aa5"
                    : entry.kind === "input"
                      ? "#9ef3f5"
                      : "#8a8f99",
              }}
            >
              <span style={{ opacity: 0.5, marginRight: 8 }}>{entry.at}</span>
              {entry.text}
            </div>
          );
        })}
        {scopePick.pick && (
          <ScopeTargetPicker
            key={`${scopePick.pick.toolId}:${scopePick.pick.operationId}:${scopePick.pick.scopes.length}`}
            title={`เลือก scope สำหรับ ${scopePick.pick.toolId}:${scopePick.pick.operationId}`}
            scopes={scopePick.pick.scopes}
            field={scopePick.pick.field}
            onResolve={(r) => void scopePick.resolve(r)}
            onCancel={scopePick.cancel}
          />
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            mode === "direct"
              ? "toolId:operationId เช่น nmap:host-discovery"
              : "เช่น: ตรวจ system info ของเครื่องนี้"
          }
          disabled={submitting}
          className="op-mono"
          style={{
            flex: 1,
            minWidth: 0,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: "10px 12px",
            color: "inherit",
            fontSize: 13,
          }}
        />
        <button
          type="submit"
          className="op-btn op-btnOk"
          disabled={submitting || !input.trim()}
        >
          <Send size={13} />
          {submitting ? "RUNNING..." : "RUN"}
        </button>
      </form>
    </div>
  );
}
