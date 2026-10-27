import { randomBytes } from "node:crypto";
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import type { ResolvedConfig } from "../config/load.js";
import type { PermissionEngine } from "../permissions/engine.js";
import { agentOptions } from "./agent-defs.js";
import type { Brief } from "./brief-schema.js";
import { createExploreHook, createWorkerHook } from "./job-hook.js";
import { Job } from "./job.js";
import { LockManager } from "./locks.js";
import { toSummary, type JobRecord, type JobSummary, type JobType } from "./types.js";

export type SpawnResult = { ok: true; jobId: string } | { ok: false; error: string };

/** The slice of Job the manager drives. A fake implements this in tests, without the model. */
export interface JobLike {
  readonly record: JobRecord;
  run(): Promise<JobRecord>;
  send(text: string): void;
  stop(): Promise<void>;
}

export type JobFactory = (id: string, type: JobType, brief: Brief, cfg: ResolvedConfig, hook: HookCallback) => JobLike;

const defaultFactory: JobFactory = (id, type, brief, cfg, hook) => new Job(id, type, brief, agentOptions(cfg, type, hook));

/**
 * Owns the set of background jobs: enforces the concurrency limit, runs each
 * job detached, and reports finished ones through onFinished (which the session
 * turns into a tagged, untrusted report for the main agent).
 */
export class JobManager {
  private readonly jobs = new Map<string, JobLike>();
  private readonly locks = new LockManager();

  constructor(
    private readonly cfg: ResolvedConfig,
    private readonly engine: PermissionEngine,
    private readonly onFinished: (record: JobRecord) => void,
    private readonly factory: JobFactory = defaultFactory,
  ) {}

  spawn(type: JobType, brief: Brief): SpawnResult {
    if (this.running().length >= this.cfg.jobs.maxConcurrent) {
      return { ok: false, error: `concurrency limit reached (${this.cfg.jobs.maxConcurrent} running). Wait for a job to finish or stop one.` };
    }
    const jobId = `${type}-${randomBytes(3).toString("hex")}`;
    const hook =
      type === "worker"
        ? createWorkerHook(this.engine, jobId, brief.allowedPaths, this.locks, this.cfg.targetRepo)
        : createExploreHook(this.engine);
    const job = this.factory(jobId, type, brief, this.cfg, hook);
    this.jobs.set(jobId, job);
    // Detached: resolves on its own and reports back; the main agent keeps working meanwhile.
    void job.run().then((record) => {
      this.locks.releaseAll(jobId); // free this job's files for others, whatever its outcome
      this.onFinished(record);
    });
    return { ok: true, jobId };
  }

  send(jobId: string, text: string): { ok: boolean; error?: string } {
    const job = this.jobs.get(jobId);
    if (!job) return { ok: false, error: `no job ${jobId}` };
    if (job.record.status !== "running") return { ok: false, error: `job ${jobId} is ${job.record.status}` };
    job.send(text);
    return { ok: true };
  }

  async stop(jobId: string): Promise<{ ok: boolean; error?: string }> {
    const job = this.jobs.get(jobId);
    if (!job) return { ok: false, error: `no job ${jobId}` };
    await job.stop();
    return { ok: true };
  }

  list(): JobSummary[] {
    const now = Date.now();
    return [...this.jobs.values()].map((j) => toSummary(j.record, now));
  }

  private running(): JobLike[] {
    return [...this.jobs.values()].filter((j) => j.record.status === "running");
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.running().map((j) => j.stop()));
  }
}
