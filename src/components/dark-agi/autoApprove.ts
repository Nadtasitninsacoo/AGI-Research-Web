// Timed auto-approve: a HUMAN arms it once for a fixed window; during that
// window, jobs that match a fixed allowlist are approved without a click.
//
// The decision is a deterministic rule — never an AI judgement. Everything
// risky (exploits, kerberoast, password cracking, AD collection, remote
// execution, credentialed ops) is deliberately NOT on the list and always
// waits for a person. The backend still enforces scope and audits each
// approval; this only removes the click for the listed read-only scans.

/** `toolId:operationId` that may be auto-approved. Read-only network scans only. */
export const AUTO_APPROVE_OPS: ReadonlySet<string> = new Set([
  "nmap:port-inventory",
  "nmap:service-identification",
  "nmap:os-fingerprint",
]);

export const AUTO_APPROVE_DURATIONS_MIN = [15, 30, 60] as const;
export const AUTO_APPROVE_DEFAULT_MIN = 30;

export type AutoApproveJob = {
  id: string;
  toolId: string;
  operationId: string;
  status: string;
  targets: string[];
};

/** Should this job be approved automatically right now? */
export function canAutoApprove(
  job: AutoApproveJob,
  armedUntil: number | null,
  now: number,
  alreadyHandled: ReadonlySet<string>,
): boolean {
  if (armedUntil === null || now >= armedUntil) return false;
  if (job.status !== "AWAITING_APPROVAL") return false;
  if (alreadyHandled.has(job.id)) return false;
  // Must have concrete targets (the backend scope gate already ran on submit).
  if (job.targets.length === 0) return false;
  return AUTO_APPROVE_OPS.has(`${job.toolId}:${job.operationId}`);
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
