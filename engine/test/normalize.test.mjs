import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCommand, stripMarkdownLinks, fixWindowsHttpAlias } from "../src/normalize.mjs";

test("strips a Markdown-link-wrapped URL to a bare URL (Problem A)", () => {
  assert.equal(
    stripMarkdownLinks("curl -s [http://localhost:3000/smart-capa/assign/3768](http://localhost:3000/smart-capa/assign/3768)"),
    "curl -s http://localhost:3000/smart-capa/assign/3768",
  );
  // label kept when the target is not a URL
  assert.equal(stripMarkdownLinks("echo [hello](not-a-url)"), "echo hello");
});

test("fixes the PowerShell curl/wget alias to the real binaries", () => {
  assert.equal(fixWindowsHttpAlias("curl -s http://x/y", "powershell"), "curl.exe -s http://x/y");
  assert.equal(fixWindowsHttpAlias("curl -s http://x/y", "wsl"), "curl -s http://x/y"); // real curl on wsl/bash
  assert.equal(fixWindowsHttpAlias("curl -s http://x/y", "cmd"), "curl -s http://x/y"); // cmd curl is real too
});

test("normalizeCommand combines the fixes and trims", () => {
  assert.equal(
    normalizeCommand("curl -s [http://localhost:3000/a](http://localhost:3000/a) ", "powershell"),
    "curl.exe -s http://localhost:3000/a",
  );
  assert.equal(normalizeCommand("nmap -sV <http://app.local>", "wsl"), "nmap -sV http://app.local");
  assert.equal(normalizeCommand("ls -la", "bash"), "ls -la"); // unchanged
});
