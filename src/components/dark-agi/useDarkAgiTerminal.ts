import { useCallback, useEffect, useRef, useState } from "react";

// Shared terminal logic for DARK AGI's human-operated command mode — used by
// both the full /dark-agi page and the floating Navbar widget, so there is
// exactly one place that knows how job polling/approval/error text works.

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
  status: JobStatus;
  risk: string;
  requiresApproval: boolean;
  result: unknown;
  error: string | null;
};

export type LogEntry = {
  id: number;
  kind: "input" | "info" | "result" | "error";
  text: string;
  at: string;
};

/** "ai": free-text, interpreted by DARK AGI's own AI (needs its Model
 * Registry configured). "direct": the line typed must be exactly
 * `toolId:operationId` — submitted as-is, no AI involved. */
export type TerminalMode = "ai" | "direct";

const POLL_MS = 3000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nowLabel(): string {
  return new Date().toLocaleTimeString();
}

function formatResult(value: unknown): string {
  if (value === null || value === undefined) return "(no result data)";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function useDarkAgiTerminal() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<TerminalMode>("ai");
  const [submitting, setSubmitting] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([
    {
      id: 0,
      kind: "info",
      text: "DARK AGI Terminal พร้อมใช้งาน — พิมพ์คำสั่งเป็นภาษาคน (ไทยหรืออังกฤษก็ได้) แล้วกด Run",
      at: nowLabel(),
    },
  ]);

  const logIdRef = useRef(1);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const appendLog = useCallback((kind: LogEntry["kind"], text: string) => {
    setLog((prev) => [...prev, { id: logIdRef.current++, kind, text, at: nowLabel() }]);
  }, []);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const describeJob = useCallback(
    (job: Job) => {
      if (job.status === "AWAITING_APPROVAL") {
        appendLog(
          "info",
          `[${job.id}] รออนุมัติจากผู้ปฏิบัติงานใน DARK AGI console ก่อนถึงจะรันได้ — กำลังรอ...`,
        );
        return false;
      }
      if (job.status === "QUEUED" || job.status === "RUNNING") {
        appendLog("info", `[${job.id}] สถานะ: ${job.status} — กำลังรอ...`);
        return false;
      }
      if (job.status === "SUCCEEDED") {
        appendLog("result", `[${job.id}] ${job.operationTitle} สำเร็จ\n${formatResult(job.result)}`);
        return true;
      }
      appendLog(
        "error",
        `[${job.id}] ${job.operationTitle} — ${job.status}${job.error ? `: ${job.error}` : ""}`,
      );
      return true;
    },
    [appendLog],
  );

  const pollJob = useCallback(
    (jobId: string) => {
      const tick = async () => {
        try {
          const res = await fetch(`/api/dark-agi/jobs/${encodeURIComponent(jobId)}`, {
            cache: "no-store",
          });
          const payload: unknown = await res.json();
          if (!res.ok) {
            const message =
              isRecord(payload) && typeof payload.message === "string"
                ? payload.message
                : `เช็คสถานะงานไม่สำเร็จ (${res.status})`;
            appendLog("error", message);
            setSubmitting(false);
            return;
          }
          const finished = describeJob(payload as Job);
          if (finished) {
            setSubmitting(false);
            return;
          }
          pollTimerRef.current = setTimeout(tick, POLL_MS);
        } catch (err) {
          appendLog("error", err instanceof Error ? err.message : "เช็คสถานะงานไม่สำเร็จ");
          setSubmitting(false);
        }
      };
      pollTimerRef.current = setTimeout(tick, POLL_MS);
    },
    [appendLog, describeJob],
  );

  const runCommand = useCallback(
    async (instruction: string) => {
      setSubmitting(true);
      appendLog("input", `> ${instruction}`);
      try {
        const res = await fetch("/api/dark-agi/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction }),
        });
        const payload: unknown = await res.json();
        if (!res.ok) {
          const message =
            isRecord(payload) && typeof payload.message === "string"
              ? payload.message
              : `คำสั่งไม่สำเร็จ (${res.status})`;
          appendLog("error", message);
          setSubmitting(false);
          return;
        }
        const job = payload as Job;
        const finished = describeJob(job);
        if (!finished) pollJob(job.id);
        else setSubmitting(false);
      } catch (err) {
        appendLog("error", err instanceof Error ? err.message : "คำสั่งไม่สำเร็จ");
        setSubmitting(false);
      }
    },
    [appendLog, describeJob, pollJob],
  );

  /** Submit one operation directly — {toolId, operationId}, no input fields,
   * no AI step. For when the exact operation is already known (e.g. picked
   * from the Command Reference) and doesn't need DARK AGI's own Model
   * Registry configured at all. A target, if the operation needs one, is
   * auto-resolved from the operator's one active Scope. */
  const runDirect = useCallback(
    async (toolId: string, operationId: string, label: string) => {
      setSubmitting(true);
      appendLog("input", `$ ${toolId}:${operationId}`);
      try {
        const res = await fetch("/api/dark-agi/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolId, operationId }),
        });
        const payload: unknown = await res.json();
        if (!res.ok) {
          const message =
            isRecord(payload) && typeof payload.message === "string"
              ? payload.message
              : `${label} ไม่สำเร็จ (${res.status})`;
          appendLog("error", message);
          setSubmitting(false);
          return;
        }
        const job = payload as Job;
        const finished = describeJob(job);
        if (!finished) pollJob(job.id);
        else setSubmitting(false);
      } catch (err) {
        appendLog("error", err instanceof Error ? err.message : `${label} ไม่สำเร็จ`);
        setSubmitting(false);
      }
    },
    [appendLog, describeJob, pollJob],
  );

  /** What the Terminal's own input box does on Run — branches on `mode`.
   * "ai": the whole line is a free-text instruction, sent to DARK AGI's AI.
   * "direct": the line must be `toolId:operationId` — parsed locally and
   * submitted straight to /jobs, no AI involved, no round-trip wasted on a
   * format DARK AGI's AI was never going to be asked to interpret anyway. */
  const submit = useCallback(() => {
    const text = input.trim();
    if (!text || submitting) return;
    setInput("");

    if (mode === "direct") {
      const sep = text.indexOf(":");
      if (sep <= 0 || sep === text.length - 1) {
        appendLog(
          "error",
          `รูปแบบไม่ถูกต้องสำหรับโหมด "รันทันที" — ต้องเป็น toolId:operationId เช่น nmap:host-discovery (พิมพ์มา: "${text}")`,
        );
        return;
      }
      void runDirect(text.slice(0, sep).trim(), text.slice(sep + 1).trim(), text);
      return;
    }

    void runCommand(text);
  }, [input, submitting, mode, runCommand, runDirect, appendLog]);

  return { input, setInput, mode, setMode, submitting, log, submit, runCommand, runDirect };
}
