import { buildRunParams } from "./payload";
import type { RunMode } from "./types";

export type PipelineMode = "sequential" | "parallel";
export type Stage = "recon" | "final";
export type Phase = "pending" | "recon" | "final" | "done" | "failed";

export type PipelineTarget = {
  ip: string;
  port: number;
  service: string | null;
  cves: number;
  vulnIds: string[];
};

export type TargetPipe = PipelineTarget & {
  key: string; // "ip:port"
  reconRunId: number | null;
  reconStatus: string | null;
  finalRunId: number | null;
  finalStatus: string | null;
};

export type PipelineJob = {
  mode: PipelineMode;
  concurrency: number;
  withFinal: boolean;
  targets: TargetPipe[];
  startedAt: number;
  active: boolean;
};

export const targetKey = (t: { ip: string; port: number }) => `${t.ip}:${t.port}`;

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
export const isTerminal = (s?: string | null): boolean => !!s && TERMINAL.has(s);

/** Derive a pipeline target's overall phase from its two run statuses. */
export function phaseOf(p: TargetPipe, withFinal: boolean): Phase {
  if (p.reconRunId == null) return "pending";
  if (!isTerminal(p.reconStatus)) return "recon";
  if (p.reconStatus !== "succeeded") return "failed";
  if (!withFinal) return "done";
  if (p.finalRunId == null) return "recon";
  if (!isTerminal(p.finalStatus)) return "final";
  return p.finalStatus === "succeeded" ? "done" : "failed";
}

export const occupiesSlot = (phase: Phase) => phase === "recon" || phase === "final";

export type JobCounts = { total: number; pending: number; active: number; done: number; failed: number };

export function countJob(job: PipelineJob): JobCounts {
  const c: JobCounts = { total: job.targets.length, pending: 0, active: 0, done: 0, failed: 0 };
  for (const p of job.targets) {
    const ph = phaseOf(p, job.withFinal);
    if (ph === "pending") c.pending++;
    else if (ph === "done") c.done++;
    else if (ph === "failed") c.failed++;
    else c.active++;
  }
  return c;
}

export const jobComplete = (job: PipelineJob): boolean =>
  job.targets.every((p) => {
    const ph = phaseOf(p, job.withFinal);
    return ph === "done" || ph === "failed";
  });

export function toPipe(t: PipelineTarget): TargetPipe {
  return {
    ip: t.ip,
    port: t.port,
    service: t.service,
    cves: t.cves,
    vulnIds: t.vulnIds ?? [],
    key: targetKey(t),
    reconRunId: null,
    reconStatus: null,
    finalRunId: null,
    finalStatus: null,
  };
}

export type PriorResults = {
  output: string | null;
  findings: { title: string; score: number; details: unknown }[];
};

function summarizePrior(prior: PriorResults): string {
  const parts: string[] = [];
  if (prior.output) parts.push(`Recon summary:\n${prior.output.slice(0, 1500)}`);
  if (prior.findings.length) {
    const lines = prior.findings
      .slice(0, 20)
      .map((f) => {
        const d = (f.details ?? {}) as Record<string, unknown>;
        const sev = typeof d.severity === "string" ? d.severity : "";
        const tgt = typeof d.target === "string" ? d.target : "";
        return `- ${f.title}${sev ? ` [${sev}]` : ""}${tgt ? ` @${tgt}` : ""} (score ${f.score})`;
      })
      .join("\n");
    parts.push(`Recon findings (${prior.findings.length}):\n${lines}`);
  }
  return parts.join("\n\n") || "(recon produced no stored findings)";
}

export function buildStageParams(opts: {
  stage: Stage;
  target: PipelineTarget;
  base: Record<string, unknown>;
  runMode: RunMode;
  coordinatorAgentId: string;
  memberAgentIds: string[];
  parentRunId?: number | null;
  priorResults?: PriorResults | null;
  authorizedScope: string[];
}): Record<string, unknown> {
  const { stage, target, base, runMode, coordinatorAgentId, memberAgentIds, parentRunId, priorResults, authorizedScope } = opts;
  const t = targetKey(target);
  const svc = target.service ? ` (${target.service})` : "";
  const cveList = target.vulnIds?.length ? target.vulnIds.join(", ") : `${target.cves} CVE(s)`;

  const priorBlock =
    stage === "final" && priorResults
      ? `\n\n=== Results carried over from recon run #${parentRunId ?? "?"} ===\n${summarizePrior(priorResults)}\n=== end of recon results ===`
      : "";

  const prompt =
    stage === "recon"
      ? `Authorized reconnaissance and enumeration of ${t}${svc}. Known CVEs: ${cveList}. ` +
        `Map attack surfaces and identify confirmed vulnerabilities within the authorized scope. ` +
        `Record findings and prepare a verification plan for the final stage.`
      : `Verification phase for ${t}${svc}${parentRunId ? ` (recon run #${parentRunId} succeeded)` : ""}. ` +
        `Using the recon findings below, confirm (do not blindly assume) each vulnerability with a non-destructive proof-of-concept, ` +
        `strictly within the authorized scope. Call record_finding for each confirmed vulnerability with evidence and remediation.${priorBlock}`;

  const withOrch = buildRunParams(runMode, base, coordinatorAgentId, memberAgentIds);

  return {
    ...withOrch,
    tools_enabled: true,
    agentId: coordinatorAgentId,
    stage,
    target: t,
    ...(parentRunId ? { parentRunId } : {}),
    ...(stage === "final" && priorResults ? { priorResults } : {}),
    scope: {
      label: `pipeline ${stage}: ${t}`,
      targets: authorizedScope,
    },
    prompt,
  };
}