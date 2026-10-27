import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseFrontmatter } from "../../src/memory/frontmatter.js";
import { MemoryStore } from "../../src/memory/store.js";

function memDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-mem-"));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

const doc = (fm: string, body = "x") => `---\n${fm}\n---\n${body}\n`;

test("parseFrontmatter reads a leading --- block and strips quotes", () => {
  const { frontmatter, body } = parseFrontmatter(doc('name: a\ndescription: "hi there"\ntype: user', "body text"));
  assert.deepEqual(frontmatter, { name: "a", description: "hi there", type: "user" });
  assert.equal(body.trim(), "body text");
});

test("store lists valid entries, flags bad ones, and skips INDEX.md", () => {
  const dir = memDir({
    "user.md": doc("name: boss\ndescription: prefers Thai\ntype: user"),
    "plan.md": doc("name: step2\ndescription: memory layer\ntype: project"),
    "bad.md": doc("name: oops\ndescription: missing type"),
    "INDEX.md": "# index",
  });
  const { entries, problems } = new MemoryStore(dir).list();
  assert.deepEqual(entries.map((e) => e.name), ["boss", "step2"]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /bad\.md/);
});

test("renderIndex groups by type as one line per memory", () => {
  const dir = memDir({
    "u.md": doc("name: boss\ndescription: prefers Thai\ntype: user"),
    "p.md": doc("name: step2\ndescription: memory layer\ntype: project"),
  });
  const index = new MemoryStore(dir).renderIndex();
  assert.match(index, /### user\n- \[boss\]\(u\.md\) — prefers Thai/);
  assert.match(index, /### project\n- \[step2\]\(p\.md\) — memory layer/);
});

test("an empty or missing memory dir renders nothing", () => {
  assert.equal(new MemoryStore(path.join(os.tmpdir(), "no-such-dir-xyz")).renderIndex(), "");
});
