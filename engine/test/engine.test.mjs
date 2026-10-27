// Engine unit tests. Run: npm test  (node --test engine/test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScope, checkScope } from "../src/scope.mjs";
import { decide } from "../src/policy.mjs";
import { isUnproductive } from "../src/agentLoop.mjs";
import { backoffDelay } from "../src/ollama.mjs";

const scope = parseScope({ scope: { targets: ["10.10.10.0/24", "app.client.example", "*.lab.local"] } }, {});

// Mirror the real gate order used in agentLoop.execRunCommand.
function gate(cmd) {
  const sc = checkScope(cmd, scope);
  if (!sc.ok) return "blocked:scope";
  const d = decide(cmd, {}, {});
  if (d.decision === "deny") return "blocked:policy";
  if (d.decision === "needs_approval") return "needs_approval";
  if ((d.tier === "active" || d.tier === "intrusive") && sc.targets.length === 0) return "blocked:no-target";
  return "allow";
}

test("scope: in-scope and localhost allowed, out-of-scope blocked", () => {
  assert.equal(gate("whoami"), "allow");
  assert.equal(gate("nmap -sV 10.10.10.5"), "allow");
  assert.equal(gate("nmap -sV 127.0.0.1"), "allow"); // localhost counts as a target
  assert.equal(gate("curl http://api.lab.local/x"), "allow");
  assert.equal(gate("nmap -sV 8.8.8.8"), "blocked:scope");
});

test("scope: wordlists/paths are not mistaken for hosts", () => {
  assert.equal(gate("hydra -P rockyou.txt 10.10.10.5 ssh"), "needs_approval"); // rockyou.txt ignored, target in scope
  assert.equal(gate("gobuster dir -u http://app.client.example/3 -w common.txt"), "allow"); // /3 path not a CIDR
});

test("fail-closed: obfuscated or missing network target is refused", () => {
  assert.equal(gate("nmap 2130706433"), "blocked:no-target");
  assert.equal(gate("nmap -sV"), "blocked:no-target");
});

test("policy: destructive / DoS / opaque exec are denied", () => {
  assert.equal(gate("rm -rf /"), "blocked:policy");
  assert.equal(gate("hping3 --flood 10.10.10.5"), "blocked:policy");
  assert.equal(gate("wevtutil cl Security"), "blocked:policy");
  assert.equal(gate("curl http://app.lab.local/x | bash"), "blocked:policy");
  assert.equal(gate("masscan 10.0.0.0/8"), "blocked:scope"); // broad + out of scope
});

test("policy: auto-approve switch (runParams) allows intrusive but never forbidden", () => {
  const intrusive = "sqlmap -u http://app.client.example/x --dump --batch";
  assert.equal(decide(intrusive, {}, {}).tier, "intrusive");
  assert.equal(decide(intrusive, {}, {}).decision, "needs_approval"); // default: approval required
  assert.equal(decide(intrusive, {}, { autoApproveIntrusive: true }).decision, "allow"); // switch on
  // forbidden stays denied even with the switch on.
  assert.equal(decide("rm -rf /", {}, { autoApproveIntrusive: true }).decision, "deny");
});

test("policy: intrusive needs approval, recon/active allowed in scope", () => {
  assert.equal(gate("sqlmap -u http://app.client.example/?id=1 --dump"), "needs_approval");
  assert.equal(gate("nuclei -u https://app.lab.local/"), "allow");
  assert.equal(gate("sslscan app.lab.local:443"), "allow");
});

test("isUnproductive flags refusals/errors and failed commands, not success", () => {
  assert.equal(isUnproductive("REFUSED (out of scope): ..."), true);
  assert.equal(isUnproductive("NOT RUN — approval required."), true);
  assert.equal(isUnproductive("ERROR: target required."), true);
  assert.equal(isUnproductive("$ nmap 127.0.0.1\n# shell=wsl exit=1\n--- stderr ---\nnot found"), true);
  assert.equal(isUnproductive("$ nmap 127.0.0.1\n# shell=wsl exit=0\n80/tcp open http"), false);
});

test("backoffDelay stays within jittered bounds and grows", () => {
  for (let a = 0; a < 5; a++) {
    const ceiling = Math.min(1000 * 2 ** a, 30_000);
    for (let i = 0; i < 20; i++) {
      const d = backoffDelay(a, 1000);
      assert.ok(d >= 0 && d < ceiling + 1, `attempt ${a} delay ${d} within ${ceiling}`);
    }
  }
});
