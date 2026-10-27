import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBrief, renderBrief } from "../../src/jobs/brief-schema.js";

const good = {
  goal: "Find where auth tokens are validated in the backend.",
  allowedPaths: ["src/app/api/**"],
  verify: "grep for the validation helper and read it",
  reportFormat: "bullet list of file:line",
};

test("a complete brief parses and gets defaults", () => {
  const r = parseBrief(good);
  assert.ok(r.ok);
  assert.ok(r.ok && r.brief.reportMaxLines === 40 && r.brief.prohibitions.length === 0);
});

test("a vague or unbounded brief is rejected with a readable error", () => {
  assert.equal(parseBrief({ ...good, goal: "fix" }).ok, false);
  const noPaths = parseBrief({ ...good, allowedPaths: [] });
  assert.ok(!noPaths.ok && /allowedPaths/.test(noPaths.error));
});

test("renderBrief shows scope, verification and the report limit", () => {
  const brief = parseBrief({ ...good, known: ["tokens are JWT"], prohibitions: ["do not edit"] });
  assert.ok(brief.ok);
  const text = renderBrief(brief.brief);
  assert.match(text, /src\/app\/api/);
  assert.match(text, /tokens are JWT/);
  assert.match(text, /Do not/);
  assert.match(text, /max 40 lines/);
});
