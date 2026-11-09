"use client";

import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Terminal as TerminalIcon, X, Maximize2, Minimize2, Minus, Square } from "lucide-react";
import { useDarkAgiTerminal } from "./useDarkAgiTerminal";
import { TerminalPanel } from "./TerminalPanel";

const DOT_COLORS = ["#ff5f57", "#febc2e", "#28c840"]; // decorative traffic-light dots only

/** Navbar trigger + a small draggable floating DARK AGI Terminal window.
 * Self-contained: its own open/closed and drag-position state, independent
 * per page (the Navbar is mounted fresh by each page, not a shared layout). */
export function TerminalFloatButton() {
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState({ x: 380, y: 64 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  );

  const terminal = useDarkAgiTerminal();

  function onDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (maximized || minimized) return;
    // Don't start a drag (and don't capture the pointer) when the press
    // started on one of the title-bar buttons — pointer capture on this
    // header would otherwise swallow their click (minimize/maximize/close).
    if ((event.target as HTMLElement).closest("button")) return;
    dragRef.current = { startX: event.clientX, startY: event.clientY, origX: pos.x, origY: pos.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    setPos({
      x: Math.max(8, dragRef.current.origX + dx),
      y: Math.max(8, dragRef.current.origY + dy),
    });
  }

  function onDragEnd() {
    dragRef.current = null;
  }

  /** Explicit pixel dimensions always — never CSS vw/vh or a mix of
   * top+bottom+width:"auto", both of which turned out fragile (vw includes
   * the scrollbar gutter in some browsers; stretch-via-inset with "auto"
   * sizing interacting with the flex column inside collapsed to nothing in
   * at least one case). Recomputed from the real window size every render,
   * which is cheap and always correct. */
  function windowBox(): { left: number; top: number; width: number; height: number } {
    if (maximized) {
      const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
      const vh = typeof window !== "undefined" ? window.innerHeight : 800;
      return { left: 24, top: 24, width: Math.max(320, vw - 48), height: Math.max(240, vh - 48) };
    }
    return { left: pos.x, top: pos.y, width: 680, height: minimized ? 44 : 600 };
  }

  const box = windowBox();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            // Reopening always starts from a known-good size — a previous
            // session's maximize/minimize glitch must never persist into a
            // "stuck invisible" state that toggling open can't recover from.
            if (next) {
              setMaximized(false);
              setMinimized(false);
            }
            return next;
          });
        }}
        className="chip"
        title="DARK AGI Terminal"
        style={{
          cursor: "pointer",
          background: open ? "rgba(248,30,54,0.14)" : "rgba(248,30,54,0.05)",
          border: open
            ? "1px solid var(--red-hot, #f81e36)"
            : "1px solid rgba(248,30,54,0.5)",
          color: open ? "#fff" : undefined,
          boxShadow: open ? "0 0 0 2px var(--red-glow, rgba(248,30,54,0.25))" : undefined,
        }}
      >
        <TerminalIcon size={11} />
        TERMINAL
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            zIndex: 999,
            display: "flex",
            flexDirection: "column",
            background: "linear-gradient(180deg, rgba(20,21,28,0.98), rgba(9,10,15,0.98))",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            boxShadow: "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(248,30,54,0.08)",
            overflow: "hidden",
          }}
        >
          <div
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              cursor: maximized || minimized ? "default" : "move",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              userSelect: "none",
              flex: "none",
            }}
          >
            <span style={{ display: "flex", gap: 6 }}>
              {DOT_COLORS.map((c) => (
                <span
                  key={c}
                  style={{ width: 10, height: 10, borderRadius: "50%", background: c }}
                />
              ))}
            </span>
            <span
              className="op-mono"
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "#fff",
                marginLeft: 4,
              }}
            >
              DARK AGI TERMINAL
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => {
                  setMinimized((v) => !v);
                  setMaximized(false);
                }}
                className="op-btn op-btnXs"
                title={minimized ? "คืนขนาด" : "พับหน้าต่าง"}
              >
                {minimized ? <Square size={10} /> : <Minus size={12} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMaximized((v) => !v);
                  setMinimized(false);
                }}
                className="op-btn op-btnXs"
                title={maximized ? "คืนขนาด" : "เต็มจอ"}
              >
                {maximized ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="op-btn op-btnXs"
                title="ปิด"
              >
                <X size={11} />
              </button>
            </div>
          </div>

          {!minimized && (
            <div style={{ flex: 1, minHeight: 0, padding: 12, display: "flex" }}>
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
                minHeight={maximized ? 300 : 260}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
