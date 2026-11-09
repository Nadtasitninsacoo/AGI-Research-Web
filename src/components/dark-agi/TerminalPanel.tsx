"use client";

import { useEffect, useRef } from "react";
import type { FormEvent } from "react";
import { Send, Sparkles, Zap } from "lucide-react";
import type { LogEntry, TerminalMode } from "./useDarkAgiTerminal";

/** The terminal's log + input, with no outer chrome — the full /dark-agi page
 * and the floating Navbar widget each wrap this in their own container. */
export function TerminalPanel({
  log,
  input,
  setInput,
  mode,
  setMode,
  submitting,
  onSubmit,
  minHeight = 280,
}: {
  log: LogEntry[];
  input: string;
  setInput: (value: string) => void;
  mode: TerminalMode;
  setMode: (mode: TerminalMode) => void;
  submitting: boolean;
  onSubmit: () => void;
  minHeight?: number;
}) {
  const logBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logBoxRef.current?.scrollTo({ top: logBoxRef.current.scrollHeight });
  }, [log]);

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

      <div
        ref={logBoxRef}
        className="op-mono"
        style={{
          flex: 1,
          overflowY: "auto",
          background: "#05060a",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          padding: 12,
          fontSize: 12.5,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          minHeight,
        }}
      >
        {log.map((entry) => (
          <div
            key={entry.id}
            style={{
              marginBottom: 8,
              color:
                entry.kind === "error"
                  ? "#ff9aa5"
                  : entry.kind === "result"
                    ? "#8ff0bb"
                    : entry.kind === "input"
                      ? "#9ef3f5"
                      : "#8a8f99",
            }}
          >
            <span style={{ opacity: 0.5, marginRight: 8 }}>{entry.at}</span>
            {entry.text}
          </div>
        ))}
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
