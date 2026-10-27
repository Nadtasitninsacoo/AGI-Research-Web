import assert from "node:assert/strict";
import { test } from "node:test";
import type { Brief } from "../../src/jobs/brief-schema.js";
import { JobManager, type JobFactory, type JobLike } from "../../src/jobs/manager.js";
import type { JobRecord, JobType } from "../../src/jobs/types.js";
import { createEngine } from "../../src/permissions/engine.js";
import { testConfig } from "./helpers.js";

const brief: Brief = { goal: "look at x".padEnd(12, "."), allowedPaths: ["src/**"], prohibitions: [], known: [], verify: "read it", reportFormat: "bullets", reportMaxLines: 40 };

/** A job that finishes only when we tell it to, so concurrency is observable. */
class FakeJob implements JobLike {
  readonly record: JobRecord;
  readonly sent: string[] = [];
  private release!: () => void;
  private readonly done = new Promise<void>((r) => (this.release = r));

  constructor(id: string, type: JobType) {
    this.record = { id, type, status: "running", brief, startedAt: Date.now(), costUsd: 0.01 };
  }
  async run(): Promise<JobRecord> {
    await this.done;
    if (this.record.status === "running") this.record.status = "done";
    this.record.report = `report from ${this.record.id}`;
    return this.record;
  }
  send(text: string): void {
    this.sent.push(text);
  }
  async stop(): Promise<void> {
    this.record.status = "stopped";
    this.release();
  }
  finish(): void {
    this.release();
  }
}

function harness() {
  const created: FakeJob[] = [];
  const finished: JobRecord[] = [];
  const factory: JobFactory = (id, type) => {
    const j = new FakeJob(id, type);
    created.push(j);
    return j;
  };
  const cfg = testConfig({ jobs: { maxConcurrent: 2 } });
  const mgr = new JobManager(cfg, createEngine(cfg), (r) => finished.push(r), factory);
  return { mgr, created, finished };
}

test("spawn returns an id and records the job", () => {
  const { mgr } = harness();
  const r = mgr.spawn("explore", brief);
  assert.ok(r.ok && r.jobId.startsWith("explore-"));
  assert.equal(mgr.list().length, 1);
});

test("the concurrency limit blocks a third running job, then frees up", async () => {
  const { mgr, created } = harness();
  assert.ok(mgr.spawn("explore", brief).ok);
  assert.ok(mgr.spawn("explore", brief).ok);
  const third = mgr.spawn("explore", brief);
  assert.ok(!third.ok && /concurrency limit/.test(third.error));

  created[0].finish();
  await new Promise((r) => setTimeout(r, 10)); // let the finished callback run
  assert.ok(mgr.spawn("explore", brief).ok, "a slot freed after one finished");
});

test("a finished job is reported through onFinished", async () => {
  const { mgr, created, finished } = harness();
  mgr.spawn("explore", brief);
  created[0].finish();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(finished.length, 1);
  assert.match(finished[0].report ?? "", /report from explore-/);
});

test("send and stop target a job by id and reject unknown ids", async () => {
  const { mgr, created } = harness();
  const { jobId } = mgr.spawn("explore", brief) as { jobId: string };
  assert.ok(mgr.send(jobId, "hint").ok);
  assert.equal(created[0].sent[0], "hint");
  assert.ok(!mgr.send("nope", "x").ok);

  await mgr.stop(jobId);
  assert.equal(created[0].record.status, "stopped");
  assert.ok(!mgr.send(jobId, "late").ok, "a stopped job rejects messages");
});
