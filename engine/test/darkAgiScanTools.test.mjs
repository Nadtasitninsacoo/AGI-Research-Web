import { test } from "node:test";
import assert from "node:assert/strict";
import { runOsFingerprint, runNseScan, runGetScanJob } from "../src/darkAgiScanTools.mjs";
import { DarkAgiHttpError } from "../src/darkAgi.mjs";

// Every scenario below mocks DARK AGI's HTTP layer and the DB via ctx.deps —
// no running DARK AGI instance or MySQL needed. logs are swallowed by a
// no-op fake so these stay silent and fast.

const noopLog = async () => {};

function baseDeps(overrides = {}) {
  return {
    isDarkAgiEnabled: () => true,
    getEngineStatus: async () => ({ paused: false }),
    listScopes: async () => [{ targets: ["10.0.0.0/24"] }],
    log: noopLog,
    execute: async () => ({}),
    maxRateCap: 1000,
    ...overrides,
  };
}

test("os_fingerprint: target outside every scope is rejected without submitting a job", async () => {
  let submitted = false;
  const deps = baseDeps({
    submitJob: async () => {
      submitted = true;
      return { id: "job-1", status: "QUEUED" };
    },
  });
  const result = await runOsFingerprint({ targets: ["203.0.113.9"] }, { deps });
  assert.match(result, /^ERROR:/);
  assert.match(result, /Scope/);
  assert.equal(submitted, false);
});

test("os_fingerprint: in-scope target submits and returns jobId without blocking on approval", async () => {
  const deps = baseDeps({
    submitJob: async (toolId, operationId, input) => {
      assert.equal(toolId, "nmap");
      assert.equal(operationId, "os-fingerprint");
      assert.deepEqual(input.targets, ["10.0.0.5"]);
      return { id: "job-42", status: "AWAITING_APPROVAL", toolId, operationId, requiresApproval: true };
    },
  });
  const result = await runOsFingerprint({ targets: ["10.0.0.5"] }, { deps });
  const parsed = JSON.parse(result);
  assert.equal(parsed.jobId, "job-42");
  assert.equal(parsed.status, "AWAITING_APPROVAL");
});

test("os_fingerprint: maxRate is clamped to the configured cap before submission", async () => {
  let seenRate = null;
  const deps = baseDeps({
    submitJob: async (_t, _o, input) => {
      seenRate = input.maxRate;
      return { id: "job-1", status: "QUEUED" };
    },
  });
  await runOsFingerprint({ targets: ["10.0.0.5"], maxRate: 999999 }, { deps });
  assert.equal(seenRate, 1000);
});

test("nse_scan: a script not on the allow-list is rejected without submitting a job", async () => {
  let submitted = false;
  const deps = baseDeps({
    submitJob: async () => {
      submitted = true;
      return { id: "job-1", status: "QUEUED" };
    },
  });
  const result = await runNseScan({ targets: ["10.0.0.5"], scripts: ["intrusive"] }, { deps });
  assert.match(result, /^ERROR:/);
  assert.equal(submitted, false);
});

test("nse_scan: a path or .lua filename is rejected", async () => {
  const deps = baseDeps({ submitJob: async () => ({ id: "x", status: "QUEUED" }) });
  const r1 = await runNseScan({ targets: ["10.0.0.5"], scripts: ["../../etc/passwd"] }, { deps });
  assert.match(r1, /^ERROR:/);
  const r2 = await runNseScan({ targets: ["10.0.0.5"], scripts: ["custom.lua"] }, { deps });
  assert.match(r2, /^ERROR:/);
});

test("nse_scan: allow-listed scripts submit successfully", async () => {
  const deps = baseDeps({
    submitJob: async (toolId, operationId, input) => {
      assert.deepEqual(input.script, ["default", "safe"]);
      return { id: "job-7", status: "QUEUED", toolId, operationId };
    },
  });
  const result = await runNseScan({ targets: ["10.0.0.5"], scripts: ["default", "safe"] }, { deps });
  const parsed = JSON.parse(result);
  assert.equal(parsed.jobId, "job-7");
});

test("get_scan_job: AWAITING_APPROVAL is reported without blocking", async () => {
  const deps = baseDeps({ getJob: async () => ({ id: "job-1", status: "AWAITING_APPROVAL" }) });
  const result = await runGetScanJob({ jobId: "job-1" }, { deps });
  const parsed = JSON.parse(result);
  assert.equal(parsed.status, "AWAITING_APPROVAL");
});

test("get_scan_job: SUCCEEDED persists each host's OS/script findings and returns them", async () => {
  const inserted = [];
  const deps = baseDeps({
    getJob: async () => ({
      id: "job-9",
      status: "SUCCEEDED",
      result: {
        hosts: [
          {
            address: "10.0.0.5",
            os: [{ name: "Linux 5.x", accuracy: 97 }],
            scripts: [{ id: "http-title", output: "Example" }],
          },
        ],
      },
    }),
    execute: async (sql, params) => {
      inserted.push(params);
      return {};
    },
  });
  const result = await runGetScanJob({ jobId: "job-9" }, { deps });
  const parsed = JSON.parse(result);
  assert.equal(parsed.status, "SUCCEEDED");
  assert.equal(parsed.hosts[0].address, "10.0.0.5");
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0][0], "job-9");
  assert.equal(inserted[0][3], "10.0.0.5");
});

test("get_scan_job: FAILED reports the failure reason, no retry attempted", async () => {
  let getJobCalls = 0;
  const deps = baseDeps({
    getJob: async () => {
      getJobCalls += 1;
      return { id: "job-5", status: "FAILED", error: "nmap: requires administrator privileges for -O (npcap)" };
    },
  });
  const result = await runGetScanJob({ jobId: "job-5" }, { deps });
  const parsed = JSON.parse(result);
  assert.equal(parsed.status, "FAILED");
  assert.match(parsed.note, /Npcap|administrator/);
  assert.equal(getJobCalls, 1); // one poll, no internal retry loop
});

test("get_scan_job: still-running status is reported as-is for the agent to poll again later", async () => {
  const deps = baseDeps({ getJob: async () => ({ id: "job-3", status: "RUNNING" }) });
  const result = await runGetScanJob({ jobId: "job-3" }, { deps });
  const parsed = JSON.parse(result);
  assert.equal(parsed.status, "RUNNING");
  assert.match(parsed.note, /get_scan_job/);
});

test("401/403/422 from DARK AGI produce a clear message and are not retried", async () => {
  const deps401 = baseDeps({
    submitJob: async () => {
      throw new DarkAgiHttpError(401, { message: "invalid token" });
    },
  });
  const r401 = await runOsFingerprint({ targets: ["10.0.0.5"] }, { deps: deps401 });
  assert.match(r401, /401/);

  const deps422 = baseDeps({
    submitJob: async () => {
      throw new DarkAgiHttpError(422, { message: "Invalid operation input" });
    },
  });
  const r422 = await runOsFingerprint({ targets: ["10.0.0.5"] }, { deps: deps422 });
  assert.match(r422, /422/);
});

test("engine paused (emergency-stop) blocks submission", async () => {
  let submitted = false;
  const deps = baseDeps({
    getEngineStatus: async () => ({ paused: true }),
    submitJob: async () => {
      submitted = true;
      return { id: "x", status: "QUEUED" };
    },
  });
  const result = await runOsFingerprint({ targets: ["10.0.0.5"] }, { deps });
  assert.match(result, /^ERROR:/);
  assert.match(result, /emergency-stop|resume/);
  assert.equal(submitted, false);
});

test("DARK AGI not configured short-circuits every tool", async () => {
  const deps = baseDeps({ isDarkAgiEnabled: () => false });
  const r1 = await runOsFingerprint({ targets: ["10.0.0.5"] }, { deps });
  const r2 = await runNseScan({ targets: ["10.0.0.5"], scripts: ["default"] }, { deps });
  const r3 = await runGetScanJob({ jobId: "job-1" }, { deps });
  for (const r of [r1, r2, r3]) assert.match(r, /not configured/);
});
