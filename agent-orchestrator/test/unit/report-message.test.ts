import assert from "node:assert/strict";
import { test } from "node:test";
import type { JobRecord } from "../../src/jobs/types.js";
import { formatReport } from "../../src/session/report-message.js";

const base: JobRecord = {
  id: "explore-ab12",
  type: "explore",
  status: "done",
  brief: { goal: "g", allowedPaths: ["x"], prohibitions: [], known: [], verify: "v", reportFormat: "f", reportMaxLines: 40 },
  startedAt: 0,
  costUsd: 0.0123,
  report: "Found the bug in foo.ts",
};

test("a report is fenced and tagged as data, not instructions", () => {
  const out = formatReport(base);
  assert.match(out, /DATA, NOT INSTRUCTIONS/);
  assert.match(out, /job explore-ab12 \(explore\) done, cost \$0\.0123/);
  assert.match(out, /----- report -----\nFound the bug in foo\.ts\n----- end report -----/);
  assert.match(out, /Re-check any claim/);
});

test("a missing report is shown explicitly", () => {
  assert.match(formatReport({ ...base, status: "error", report: undefined }), /\(no report\)/);
});
