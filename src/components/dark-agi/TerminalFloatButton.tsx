"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  Terminal as TerminalIcon,
  X,
  Maximize2,
  Minimize2,
  Minus,
  Square,
} from "lucide-react";
import { useDarkAgiTerminal } from "./useDarkAgiTerminal";
import { TerminalPanel } from "./TerminalPanel";

const DOT_COLORS = ["#ff5f57", "#febc2e", "#28c840"]; // decorative traffic-light dots only

// The window's non-maximized size — maximized size is computed from the
// real viewport instead (see currentSize()).
const NORMAL_WIDTH = 680;
const NORMAL_HEIGHT = 600;
const MINIMIZED_HEIGHT = 44;

// How much of the window must stay reachable on screen — NOT "the whole box
// must fit". A maximized-size box is already ~viewport-wide, so requiring
// the entire width to stay on screen left only ~30-40px of room to drag it
// at all. Real OS windows let you drag until only the title bar is left
// grabbable; this does the same, so a near-full-width window still has the
// whole screen to move across (including sliding fully over the sidebar).
const MIN_VISIBLE_X = 120;
const MIN_VISIBLE_Y = 40;

function viewportSize(): { vw: number; vh: number } {
  return {
    vw: typeof window !== "undefined" ? window.innerWidth : 1280,
    vh: typeof window !== "undefined" ? window.innerHeight : 800,
  };
}

function clampPos(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const { vw, vh } = viewportSize();
  const minX = MIN_VISIBLE_X - width;
  const maxX = Math.max(minX, vw - MIN_VISIBLE_X);
  const minY = 0;
  const maxY = Math.max(minY, vh - MIN_VISIBLE_Y);
  return {
    x: Math.min(Math.max(minX, x), maxX),
    y: Math.min(Math.max(minY, y), maxY),
  };
}

/** Navbar trigger + a small draggable floating DARK AGI Terminal window.
 * Self-contained: its own open/closed and drag-position state, independent
 * per page (the Navbar is mounted fresh by each page, not a shared layout). */
export function TerminalFloatButton() {
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState({ x: 380, y: 64 });
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const terminal = useDarkAgiTerminal();

  // Portal target: document.body doesn't exist during SSR, and even
  // client-side the very first render must match the server's markup, so the
  // portal only mounts after that first pass.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Always remove any in-flight drag listeners on unmount — otherwise a drag
  // started right before navigating away would leak window-level listeners.
  useEffect(() => () => dragCleanupRef.current?.(), []);

  /** The window's actual current size — large while maximized, 680×600
   * normally, 680×44 (just the title bar) while minimized. Dragging only
   * ever repositions this box, never resizes it — so maximized stays
   * maximized-sized while you move it around, it doesn't snap down to the
   * normal size just because you started dragging it. */
  function currentSize(): { width: number; height: number } {
    if (maximized) {
      const { vw, vh } = viewportSize();
      return { width: Math.max(320, vw - 48), height: Math.max(240, vh - 48) };
    }
    return {
      width: NORMAL_WIDTH,
      height: minimized ? MINIMIZED_HEIGHT : NORMAL_HEIGHT,
    };
  }

  /** Dragging is tracked with listeners on `window`, not React's
   * onPointerMove/onPointerUp + setPointerCapture on the header div. Pointer
   * capture is supposed to redirect every subsequent event to the capturing
   * element regardless of what's visually underneath, but in practice the
   * drag was getting stuck exactly at the sidebar's edge — capture alone
   * wasn't reliable with other positioned elements on the page. Listening on
   * `window` has no such dependency: it fires for the whole viewport no
   * matter what element the cursor is physically over. */
  function onDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    // Don't start a drag when the press started on one of the title-bar
    // buttons (minimize/maximize/close) — only the header background drags.
    if ((event.target as HTMLElement).closest("button")) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const origX = pos.x;
    const origY = pos.y;
    const { width, height } = currentSize();

    const handleMove = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      setPos(clampPos(origX + dx, origY + dy, width, height));
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      dragCleanupRef.current = null;
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    dragCleanupRef.current = handleUp;
  }

  /** Explicit pixel dimensions always — never CSS vw/vh or a mix of
   * top+bottom+width:"auto", both of which turned out fragile (vw includes
   * the scrollbar gutter in some browsers; stretch-via-inset with "auto"
   * sizing interacting with the flex column inside collapsed to nothing in
   * at least one case). Recomputed from the real window size every render,
   * which is cheap and always correct.
   *
   * Position (left/top) always comes from `pos` — even maximized/minimized,
   * dragging repositions the window instead of being locked until restored
   * (so "maximized" here just means "currently sized large", not an OS-style
   * locked state). */
  function windowBox(): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    return { left: pos.x, top: pos.y, ...currentSize() };
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
          boxShadow: open
            ? "0 0 0 2px var(--red-glow, rgba(248,30,54,0.25))"
            : undefined,
        }}
      >
        <TerminalIcon size={11} />
        TERMINAL
      </button>

      {mounted &&
        open &&
        createPortal(
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
              background:
                "linear-gradient(180deg, rgba(20,21,28,0.98), rgba(9,10,15,0.98))",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              boxShadow:
                "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(248,30,54,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              onPointerDown={onDragStart}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                cursor: "move",
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
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: c,
                    }}
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
                    setMaximized((v) => {
                      const next = !v;
                      // Entering maximize starts flush in the corner — pos is
                      // reused as-is for the large box too (that's what makes
                      // it draggable afterward), so without this reset it'd
                      // offset the near-full-viewport size by wherever the
                      // window last sat, overflowing off-screen.
                      if (next) setPos({ x: 24, y: 24 });
                      return next;
                    });
                    setMinimized(false);
                  }}
                  className="op-btn op-btnXs"
                  title={maximized ? "คืนขนาด" : "เต็มจอ"}
                >
                  {maximized ? (
                    <Minimize2 size={11} />
                  ) : (
                    <Maximize2 size={11} />
                  )}
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
              <div
                style={{ flex: 1, minHeight: 0, padding: 12, display: "flex" }}
              >
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
          </div>,
          document.body,
        )}
    </>
  );
}
