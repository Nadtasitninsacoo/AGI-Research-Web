import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { isDagiCommand, operationsFrom, parseDagiCommand } from "./dagiCommand.ts";

// Shared terminal logic for DARK AGI's human-operated command mode.
//
// The LOG (job history/results) is a SINGLE MODULE-LEVEL STORE, not
// per-component state: the embedded Terminal on /dark-agi and the floating
// Navbar widget both call useDarkAgiTerminal() independently, and must show
// the exact same live history — a command run in one has to appear in the
// other immediately, never only in whichever instance happened to submit it.
// Two separate useState()-based instances would each keep their own copy and
// silently clobber each other's localStorage snapshot; useSyncExternalStore
// ties every caller to one real log instead.
//
// `input`, `mode` and `search`, by contrast, are per-surface UI state, NOT
// shared — each terminal keeps its own draft text, its own AI/DIRECT toggle
// and its own search box. Sharing those too made typing in one instance's
// search box visibly appear in the other's, which reads as one UI glitching
// into two places at once; only the underlying log needs to be one source
// of truth.

export type JobStatus =
  | "AWAITING_APPROVAL"
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "REJECTED";

export type Job = {
  id: string;
  toolId: string;
  operationId: string;
  operationTitle: string;
  targets: string[];
  scope: { id: string; name: string } | null;
  status: JobStatus;
  risk: string;
  requiresApproval: boolean;
  result: unknown;
  error: string | null;
};

export type LogEntry =
  | { id: number; kind: "input" | "info" | "error" | "banner"; text: string; at: string }
  /** A job's live status, rendered as a styled banner (see JobBanner.tsx) —
   * updated in place as it moves QUEUED → RUNNING → SUCCEEDED/FAILED/…,
   * rather than spamming a new line on every poll tick. */
  | { id: number; kind: "job"; job: Job; at: string };

/** "ai": free-text, interpreted by DARK AGI's own AI (needs its Model
 * Registry configured). "direct": the line typed must be exactly
 * `toolId:operationId` — submitted as-is, no AI involved. */
export type TerminalMode = "ai" | "direct";

const POLL_MS = 2000;
// This platform caps at 2 jobs running at once, globally — a job can
// legitimately sit QUEUED for minutes waiting for a free slot. That's normal,
// not stuck, so polling for job status itself never gives up. This cap is
// only for genuinely transient failures (network blip, DARK AGI restarting)
// — not for the job's own status, which is never rate-limited this way.
const MAX_TRANSIENT_FAILURES = 30;
const TERMINAL_STATUSES = new Set<JobStatus>(["SUCCEEDED", "FAILED", "CANCELLED", "REJECTED"]);

// History persists per-browser only (localStorage) — it's a convenience for
// the one operator at this keyboard, never read back by anything else, and
// never a substitute for DARK AGI's own server-side audit log.
const STORAGE_KEY = "dark-agi-terminal-log-v1";
const MAX_LOG_ENTRIES = 300;

/** Words DARK AGI's own Terminal handles locally, before ever trying to parse
 * or submit the line as a job — checked first, in both AI and DIRECT mode. */
const LOCAL_COMMANDS = new Set(["banner"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** DARK AGI's validation-error shape: { message, issues: [{ path, message }] }.
 * The bare `message` alone ("Invalid operation input") tells a human nothing
 * actionable — render each issue too, so they know exactly which field. */
function formatApiError(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  const message = typeof payload.message === "string" ? payload.message : fallback;
  const issues = Array.isArray(payload.issues) ? payload.issues : [];
  const lines = issues
    .map((issue): string | null => {
      if (!isRecord(issue)) return null;
      const msg = typeof issue.message === "string" ? issue.message : null;
      if (!msg) return null;
      const rawPath = issue.path;
      const path = Array.isArray(rawPath)
        ? rawPath.join(".")
        : typeof rawPath === "string" && rawPath
          ? rawPath
          : null;
      return path ? `${path}: ${msg}` : msg;
    })
    .filter((line): line is string => Boolean(line));
  return lines.length > 0 ? `${message}\n${lines.map((l) => `  • ${l}`).join("\n")}` : message;
}

function nowLabel(): string {
  return new Date().toLocaleTimeString();
}

function welcomeEntry(): LogEntry {
  return {
    id: 0,
    kind: "info",
    text: "DARK AGI Terminal พร้อมใช้งาน — พิมพ์คำสั่งเป็นภาษาคน (ไทยหรืออังกฤษก็ได้) แล้วกด Run",
    at: nowLabel(),
  };
}

function isLogEntry(value: unknown): value is LogEntry {
  if (!isRecord(value) || typeof value.id !== "number" || typeof value.at !== "string") return false;
  if (value.kind === "job") return isRecord(value.job);
  return (
    value.kind === "input" || value.kind === "info" || value.kind === "error" || value.kind === "banner"
  );
}

function loadPersistedLog(): LogEntry[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const entries = parsed.filter(isLogEntry);
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

function persistLog(log: LogEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(-MAX_LOG_ENTRIES)));
  } catch {
    // Storage unavailable (private window, quota, disabled) — history just
    // won't survive a refresh this time; the terminal itself still works.
  }
}

function nextLogId(log: LogEntry[]): number {
  return log.reduce((max, e) => Math.max(max, e.id + 1), 1);
}

function buildJobIndex(log: LogEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of log) {
    if (entry.kind === "job") map.set(entry.job.id, entry.id);
  }
  return map;
}

/** Does this entry's visible text match the search query? */
function matchesSearch(entry: LogEntry, query: string): boolean {
  if (!query) return true;
  const haystack =
    entry.kind === "job"
      ? `${entry.job.toolId}:${entry.job.operationId} ${entry.job.operationTitle} ${entry.job.status} ${entry.job.targets.join(" ")}`
      : entry.text;
  return haystack.toLowerCase().includes(query);
}

// ── The one true store — log + submitting only ──────────────────────────

type Store = {
  submitting: boolean;
  log: LogEntry[];
};

let store: Store = {
  submitting: false,
  log: loadPersistedLog() ?? [welcomeEntry()],
};

let logIdCounter = nextLogId(store.log);
const jobEntryIndex = buildJobIndex(store.log);
let pollTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Store {
  return store;
}

function patchStore(patch: Partial<Store>) {
  store = { ...store, ...patch };
  emit();
}

function updateLog(updater: (prev: LogEntry[]) => LogEntry[]) {
  const next = updater(store.log);
  store = { ...store, log: next };
  persistLog(next);
  emit();
}

function appendLog(kind: "input" | "info" | "error" | "banner", text: string) {
  updateLog((prev) =>
    [...prev, { id: logIdCounter++, kind, text, at: nowLabel() }].slice(-MAX_LOG_ENTRIES),
  );
}

function upsertJobEntry(job: Job) {
  updateLog((prev) => {
    const existingId = jobEntryIndex.get(job.id);
    if (existingId !== undefined) {
      return prev.map((entry): LogEntry =>
        entry.id === existingId ? { id: existingId, kind: "job", job, at: nowLabel() } : entry,
      );
    }
    const id = logIdCounter++;
    jobEntryIndex.set(job.id, id);
    const next: LogEntry = { id, kind: "job", job, at: nowLabel() };
    return [...prev, next].slice(-MAX_LOG_ENTRIES);
  });
}

function describeJob(job: Job): boolean {
  upsertJobEntry(job);
  return TERMINAL_STATUSES.has(job.status);
}

function clearLog() {
  jobEntryIndex.clear();
  logIdCounter = 1;
  const fresh = [welcomeEntry()];
  store = { ...store, log: fresh };
  persistLog(fresh);
  emit();
}

function pollJob(jobId: string) {
  // Scoped to this one poll chain — resets to 0 on every successful
  // response, regardless of how long the job itself has been QUEUED.
  let transientFailures = 0;

  const tick = async () => {
    try {
      const res = await fetch(`/api/dark-agi/jobs/${encodeURIComponent(jobId)}`, {
        cache: "no-store",
      });
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        transientFailures += 1;
        if (transientFailures > MAX_TRANSIENT_FAILURES) {
          appendLog("error", formatApiError(payload, `เช็คสถานะงานไม่สำเร็จต่อเนื่อง (${res.status})`));
          patchStore({ submitting: false });
          return;
        }
        // Likely transient (network blip, DARK AGI restarting) — keep
        // trying; this is not the job's own status.
        pollTimer = setTimeout(tick, POLL_MS);
        return;
      }

      transientFailures = 0;
      const finished = describeJob(payload as Job);
      if (finished) {
        patchStore({ submitting: false });
        return;
      }
      // Still AWAITING_APPROVAL / QUEUED / RUNNING — keep polling no matter
      // how long; never give up on a job that's legitimately waiting for a
      // free execution slot.
      pollTimer = setTimeout(tick, POLL_MS);
    } catch (err) {
      transientFailures += 1;
      if (transientFailures > MAX_TRANSIENT_FAILURES) {
        appendLog("error", err instanceof Error ? err.message : "เช็คสถานะงานไม่สำเร็จต่อเนื่อง");
        patchStore({ submitting: false });
        return;
      }
      pollTimer = setTimeout(tick, POLL_MS);
    }
  };
  pollTimer = setTimeout(tick, POLL_MS);
}

async function runCommand(instruction: string) {
  patchStore({ submitting: true });
  appendLog("input", `> ${instruction}`);
  try {
    const res = await fetch("/api/dark-agi/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction }),
    });
    const payload: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      appendLog("error", formatApiError(payload, `คำสั่งไม่สำเร็จ (${res.status})`));
      patchStore({ submitting: false });
      return;
    }
    const job = payload as Job;
    const finished = describeJob(job);
    if (!finished) pollJob(job.id);
    else patchStore({ submitting: false });
  } catch (err) {
    appendLog("error", err instanceof Error ? err.message : "คำสั่งไม่สำเร็จ");
    patchStore({ submitting: false });
  }
}

/** Submit one operation directly — {toolId, operationId}, no input fields, no
 * AI step. For when the exact operation is already known (e.g. picked from
 * the Command Reference) and doesn't need DARK AGI's own Model Registry
 * configured at all. A target, if the operation needs one, is auto-resolved
 * from the operator's one active Scope. */
async function runDirect(
  toolId: string,
  operationId: string,
  label: string,
  input?: Record<string, unknown>,
) {
  patchStore({ submitting: true });
  const targets = Array.isArray(input?.targets) ? (input.targets as string[]) : [];
  appendLog(
    "input",
    `$ ${toolId}:${operationId}${targets.length > 0 ? ` on ${targets.length} รายการ: ${targets.join(", ")}` : ""}`,
  );
  try {
    const res = await fetch("/api/dark-agi/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolId, operationId, input: input ?? {} }),
    });
    const payload: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      appendLog("error", formatApiError(payload, `${label} ไม่สำเร็จ (${res.status})`));
      patchStore({ submitting: false });
      return;
    }
    const job = payload as Job;
    const finished = describeJob(job);
    if (!finished) pollJob(job.id);
    else patchStore({ submitting: false });
  } catch (err) {
    appendLog("error", err instanceof Error ? err.message : `${label} ไม่สำเร็จ`);
    patchStore({ submitting: false });
  }
}

/** Runs a `dagi …` shorthand line: field types come from the live /operations
 * catalogue, then the parsed job goes straight to runDirect (no AI). */
async function runDagiCommand(text: string) {
  patchStore({ submitting: true });
  try {
    const res = await fetch("/api/dark-agi/operations", { cache: "no-store" });
    const payload: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      appendLog("input", `> ${text}`);
      appendLog("error", formatApiError(payload, `โหลดรายการคำสั่งไม่สำเร็จ (${res.status})`));
      patchStore({ submitting: false });
      return;
    }
    const parsed = parseDagiCommand(text, operationsFrom(payload));
    await runDirect(parsed.toolId, parsed.operationId, text, parsed.input);
  } catch (err) {
    appendLog("input", `> ${text}`);
    appendLog("error", err instanceof Error ? err.message : "คำสั่งไม่สำเร็จ");
    patchStore({ submitting: false });
  }
}

/** A word DARK AGI's own Terminal intercepts locally, before ever attempting
 * to parse/submit it as a job (AI or DIRECT mode alike). Only "banner" today
 * — DARK AGI's own client lists no others. Returns true if it handled the
 * line (caller must stop there), false if this isn't a local command. */
async function runLocalCommand(text: string): Promise<boolean> {
  if (!LOCAL_COMMANDS.has(text)) return false;

  if (text === "banner") {
    patchStore({ submitting: true });
    appendLog("input", `> ${text}`);
    try {
      const res = await fetch("/api/dark-agi/banner", { cache: "no-store" });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        appendLog("error", formatApiError(payload, `โหลด banner ไม่สำเร็จ (${res.status})`));
      } else {
        const bannerText = isRecord(payload) && typeof payload.text === "string" ? payload.text : "";
        appendLog("banner", bannerText || "(banner ว่างเปล่า)");
      }
    } catch (err) {
      appendLog("error", err instanceof Error ? err.message : "โหลด banner ไม่สำเร็จ");
    } finally {
      patchStore({ submitting: false });
    }
  }

  return true;
}

export type ParsedDirectCommand =
  | { ok: true; toolId: string; operationId: string; targets: string[] }
  | { ok: false };

/** Pure parser for one DIRECT-mode line: `toolId:operationId`, with an
 * optional trailing `on <target>[, <target>...]` — exactly what the Command
 * Reference's own hint text tells people to type, so this has to actually
 * split it out instead of letting " on <target>" end up stuffed verbatim
 * into operationId (which DARK AGI then rejects as an unknown operation
 * name). Multiple comma-separated targets are supported so a human can send
 * a whole batch in one line; `targets` is always an array (empty = none
 * given — the backend auto-resolves from the active Scope) so the count of
 * what was actually sent in is never ambiguous. Exported and side-effect-free
 * so it's independently testable without the hook/network. */
export function parseDirectCommand(text: string): ParsedDirectCommand {
  const match = text.match(/^([^:\s]+):(\S+)(?:\s+on\s+(.+))?$/i);
  if (!match) return { ok: false };
  const [, toolId, operationId, targetList] = match;
  const targets = targetList
    ? targetList
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  return { ok: true, toolId: toolId.trim(), operationId: operationId.trim(), targets };
}

/** What a Terminal's input box does on Run, given its own local `text` and
 * `mode` (per-surface — see the module doc comment above).
 * 1. A locally-handled word ("banner", …) is intercepted here first — it
 *    never reaches AI or DIRECT submission at all.
 * 2. "ai": the whole line is a free-text instruction, sent to DARK AGI's AI.
 * 3. "direct": the line must be `toolId:operationId` — parsed locally and
 *    submitted straight to /jobs, no AI involved. */
function dispatchSubmit(text: string, mode: TerminalMode) {
  void (async () => {
    if (await runLocalCommand(text)) return;

    // `dagi <verb> key=value … keng` shorthand — parsed locally in either mode
    // (no AI call, so it also works when the AI quota is exhausted).
    if (isDagiCommand(text)) {
      await runDagiCommand(text);
      return;
    }

    if (mode === "direct") {
      const parsed = parseDirectCommand(text);
      if (!parsed.ok) {
        appendLog(
          "error",
          `รูปแบบไม่ถูกต้องสำหรับโหมด "รันทันที" — ต้องเป็น toolId:operationId หรือ toolId:operationId on <target> เช่น nmap:host-discovery on 10.0.0.5 (พิมพ์มา: "${text}")`,
        );
        return;
      }
      await runDirect(
        parsed.toolId,
        parsed.operationId,
        text,
        parsed.targets.length > 0 ? { targets: parsed.targets } : undefined,
      );
      return;
    }

    await runCommand(text);
  })();
}

export function useDarkAgiTerminal() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Per-surface, not shared: each terminal instance keeps its own draft
  // text, its own AI/DIRECT toggle and its own search box.
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<TerminalMode>("ai");
  const [search, setSearch] = useState("");

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text || snapshot.submitting) return;
    setInput("");
    dispatchSubmit(text, mode);
  }, [input, mode, snapshot.submitting]);

  const visibleLog = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? snapshot.log.filter((entry) => matchesSearch(entry, query)) : snapshot.log;
  }, [snapshot.log, search]);

  return {
    input,
    setInput,
    mode,
    setMode,
    submitting: snapshot.submitting,
    log: visibleLog,
    search,
    setSearch,
    clearLog,
    submit,
    runCommand,
    runDirect,
  };
}
