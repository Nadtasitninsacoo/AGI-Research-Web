// Lessons & Tactical Memory unit tests - DARK AGI Ultimate Limitless & Stealth Protocol.
// Run: npm test (node --test engine/test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTags, renderLessons } from "../src/lessons.mjs";

test("extractTags pulls distinct tactical keywords, drops stopwords and short tokens", () => {
  const tags = extractTags("Bypass EDR telemetry, extract credential hashes and establish backdoor persistence on target");
  assert.ok(tags.includes("bypass"));
  assert.ok(tags.includes("edr"));
  assert.ok(tags.includes("extract"));
  assert.ok(tags.includes("credential"));
  assert.ok(tags.includes("persistence"));
  assert.ok(!tags.includes("and")); // stopword
  assert.ok(!tags.includes("on")); // stopword
  assert.equal(new Set(tags).size, tags.length); // distinct tags only
});

test("renderLessons formats recalled dark tactics and stealth countermeasures, empty for none", () => {
  assert.equal(renderLessons([]), "");
  assert.equal(renderLessons(null), "");
  
  const out = renderLessons([
    { problem: "EDR blocked direct powershell payload execution", solution: "inject into legitimate process memory and obfuscate base64 strings" },
    { problem: null, solution: "maintain absolute stealth, suppress system event logs, and ensure zero-trace persistence" },
  ]);

  assert.match(out, /Lessons from past runs/);
  assert.match(out, /when EDR blocked direct powershell payload execution: inject into legitimate process memory/);
  assert.match(out, /maintain absolute stealth, suppress system event logs/);
});