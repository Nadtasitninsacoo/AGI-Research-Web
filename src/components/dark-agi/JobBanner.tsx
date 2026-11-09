import type { Job, JobStatus } from "./useDarkAgiTerminal";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Visual language for a job's status — matches DARK AGI's own console:
 * cyan/green solid glyph for success, red for failure/rejection, amber
 * pulsing glyph while it's still in flight. */
function statusVisual(status: JobStatus): { tone: string; glyph: string; live: boolean; label: string } {
  switch (status) {
    case "SUCCEEDED":
      return { tone: "job-status-ok", glyph: "✓", live: false, label: "SUCCEEDED" };
    case "FAILED":
      return { tone: "job-status-bad", glyph: "✕", live: false, label: "FAILED" };
    case "REJECTED":
      return { tone: "job-status-bad", glyph: "▲", live: false, label: "REJECTED" };
    case "CANCELLED":
      return { tone: "job-status-bad", glyph: "✕", live: false, label: "CANCELLED" };
    case "AWAITING_APPROVAL":
      return { tone: "job-status-warn", glyph: "●", live: true, label: "AWAITING APPROVAL" };
    case "RUNNING":
      return { tone: "job-status-warn", glyph: "●", live: true, label: "RUNNING" };
    case "QUEUED":
    default:
      return { tone: "job-status-warn", glyph: "●", live: true, label: "QUEUED" };
  }
}

/** A short, honest one-line verdict for the result — never a raw JSON dump.
 * `metasploit:exploit-launch` gets special phrasing: this is a hardening
 * check against the operator's own pre-approved lab asset, not a trophy. */
function summarize(job: Job): string {
  if (job.toolId === "metasploit" && job.operationId === "exploit-launch" && job.status === "SUCCEEDED") {
    const opened = isRecord(job.result) ? job.result.opened : undefined;
    if (opened === true) {
      return "⚠ TARGET REACHABLE — session opened and immediately closed (proof only)";
    }
    if (opened === false) {
      return "✓ TARGET HELD — no session could be opened";
    }
  }

  if (job.status === "SUCCEEDED") {
    const r = job.result;
    if (isRecord(r) && typeof r.summary === "string") return r.summary;
    if (Array.isArray(r)) return `${r.length} item${r.length === 1 ? "" : "s"} returned`;
    if (r === null || r === undefined) return "เสร็จสิ้น — ไม่มีข้อมูลผลลัพธ์เพิ่มเติม";
    try {
      const text = JSON.stringify(r);
      return text.length > 160 ? `${text.slice(0, 160)}…` : text;
    } catch {
      return "เสร็จสิ้น";
    }
  }

  if (job.status === "AWAITING_APPROVAL") return "รออนุมัติจากผู้ปฏิบัติงานใน DARK AGI console — ยังทำงานอยู่ ไม่ใช่ค้าง";
  if (job.status === "QUEUED")
    return "กำลังรอคิว — ระบบรันพร้อมกันได้สูงสุด 2 งานทั่วทั้งแพลตฟอร์ม อาจรอสักครู่ถึงหลายนาที ไม่ใช่ค้าง";
  if (job.status === "RUNNING") return "กำลังทำงาน...";
  return job.error ?? job.status;
}

export function JobBanner({ job }: { job: Job }) {
  const visual = statusVisual(job.status);
  const target = job.targets.length > 0 ? job.targets.join(", ") : job.scope?.name ?? "(auto-resolved scope)";

  return (
    <div className={`job-banner ${visual.live ? "is-live" : ""}`}>
      <div className="job-banner-head">
        <TerminalGlyph />
        DARK AGI · JOB {job.id.slice(0, 8)}
      </div>

      <div className="job-banner-row">
        <span className="job-banner-label">OPERATION</span>
        <span className="job-banner-value op-mono">
          {job.toolId}:{job.operationId}
          {job.operationTitle ? ` — ${job.operationTitle}` : ""}
        </span>
      </div>

      <div className="job-banner-row">
        <span className="job-banner-label">TARGET</span>
        <span className="job-banner-value op-mono">{target}</span>
      </div>

      <div className="job-banner-row">
        <span className="job-banner-label">STATUS</span>
        <span className={`job-banner-value ${visual.tone}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className={`job-dot ${visual.live ? "is-live" : ""}`} />
          {visual.glyph} {visual.label}
        </span>
      </div>

      <div className="job-banner-row">
        <span className="job-banner-label">SUMMARY</span>
        <span className="job-banner-value">{summarize(job)}</span>
      </div>
    </div>
  );
}

function TerminalGlyph() {
  return <span style={{ opacity: 0.6 }}>&gt;_</span>;
}
