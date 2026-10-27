import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTags, renderLessons } from "../src/lessons.mjs";

test("extractTags pulls distinct keywords, drops stopwords and short tokens", () => {
  const tags = extractTags("Scan app.local for SQL injection and XSS vulnerabilities");
  assert.ok(tags.includes("app"));
  assert.ok(tags.includes("local"));
  assert.ok(tags.includes("sql"));
  assert.ok(tags.includes("injection"));
  assert.ok(!tags.includes("and")); // stopword
  assert.ok(!tags.includes("for")); // stopword
  assert.equal(new Set(tags).size, tags.length); // distinct
});

test("renderLessons formats recalled lessons, empty for none", () => {
  assert.equal(renderLessons([]), "");
  assert.equal(renderLessons(null), "");
  const out = renderLessons([
    { problem: "curl failed on powershell", solution: "use curl.exe or run via wsl" },
    { problem: null, solution: "respect scope: do not scan out-of-scope hosts" },
  ]);
  assert.match(out, /Lessons from past runs/);
  assert.match(out, /when curl failed on powershell: use curl\.exe/);
  assert.match(out, /respect scope/);
});
