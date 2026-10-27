import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { ORCH_ROOT } from "../../src/util/paths.js";
import { decider, REPO } from "./helpers.js";

const d = decider();
const expectBash = (decision: string, cmds: string[]) => {
  for (const c of cmds) assert.equal(d.bash(c).decision, decision, `${c} → ${JSON.stringify(d.bash(c))}`);
};

describe("allow by default", () => {
  test("read and search", () => {
    assert.equal(d.file("Read", "src/app/page.tsx").decision, "allow");
    assert.equal(d.call("Grep", { pattern: "process.env", glob: "**/*.ts" }).decision, "allow");
    assert.equal(d.call("Glob", { pattern: "src/**/*.tsx" }).decision, "allow");
  });
  test("edits inside the project", () => {
    assert.equal(d.file("Edit", path.join(REPO, "src/app/page.tsx")).decision, "allow");
    assert.equal(d.file("Write", "src/lib/new.ts").decision, "allow");
  });
  test("checks and read-only git", () => {
    expectBash("allow", [
      "npx tsc --noEmit",
      "npm test",
      "npm run lint",
      "npx eslint src",
      "git status",
      "git diff --stat",
      "git log --oneline -5",
      "git fetch origin",
      "git remote -v",
      "git status && git diff",
      "npm test 2>&1 | tail -20",
      "ls src > /dev/null",
    ]);
  });
});

describe("ask by default", () => {
  test("git commit / push", () => expectBash("ask", ["git commit -m 'x'", "git push origin feature/x", "git push", "git add . && git commit -m wip"]));
  test("deleting files", () => expectBash("ask", ["rm src/old.ts", "rm -rf node_modules", "git rm a.ts", "find . -name '*.tmp' -delete"]));
  test("database writes", () => expectBash("ask", ["mysql -e 'DELETE FROM runs'", "npm run db:seed", "npm run reset-demo"]));
  test("deploy", () => expectBash("ask", ["vercel --prod", "kubectl apply -f k8s/", "npm run deploy"]));
  test("outbound", () => expectBash("ask", ["curl -X POST https://hooks.example.com -d @data.json", "gh pr create", "ssh prod"]));
  test("force push to a feature branch", () => expectBash("ask", ["git push --force origin feature/x"]));
  test("file redirection and substitution", () => expectBash("ask", ["echo hi > notes.txt", "cat $(ls)", "echo `whoami`"]));
  test("unknown commands", () => expectBash("ask", ["python script.py", "npx some-tool"]));
  test("edits outside the project", () => {
    assert.equal(d.file("Write", path.resolve(REPO, "../other-repo/x.ts")).decision, "ask");
    assert.equal(d.file("Edit", "C:/Windows/System32/drivers/etc/hosts").decision, "ask");
  });
  test("edits to the orchestrator's own policy", () => {
    assert.equal(d.file("Edit", path.join(ORCH_ROOT, "src/permissions/defaults.ts")).decision, "ask");
    assert.equal(d.file("Write", path.join(ORCH_ROOT, "agent.config.ts")).decision, "ask");
  });
  test("an allowed segment does not launder a risky one", () => {
    assert.equal(d.bash("git status; git push origin main").decision, "ask");
  });
});

describe("deny by default", () => {
  test("sweeping rm", () => expectBash("deny", ["rm -rf /", "rm -rf /*", "sudo rm -rf /", "rm -fr ~", "rm -r -f .", "rm -rf C:\\", "rm --no-preserve-root -rf /", "ls && rm -rf /"]));
  test("force push to main", () =>
    expectBash("deny", [
      "git push --force origin main",
      "git push -f origin master",
      "git push origin +main",
      "git push --force-with-lease origin HEAD:main",
      "git push -f",
      "git push --force origin",
      "git push origin :main",
      "git push --mirror",
    ]));
  test(".env values", () => {
    expectBash("deny", ["cat .env.local", "cat ./.env", "grep KEY .env", "printenv", "env", "echo $ANTHROPIC_API_KEY"]);
    assert.equal(d.file("Read", path.join(REPO, ".env.local")).decision, "deny");
    assert.equal(d.call("Grep", { pattern: "KEY", glob: ".env*" }).decision, "deny");
    assert.equal(d.call("Glob", { pattern: "**/.env.local" }).decision, "deny");
  });
  test(".env.example and look-alikes are fine", () => {
    assert.equal(d.file("Read", ".env.example").decision, "allow");
    assert.equal(d.bash("cat .env.example").decision, "allow");
    assert.equal(d.file("Read", "src/environment.ts").decision, "allow");
  });
});

describe("config rules", () => {
  test("extra deny rule by path", () => {
    const c = decider({ permissions: { rules: [{ id: "no-db", decision: "deny", tools: ["Write", "Edit"], path: "**/db/**" }] } });
    assert.equal(c.file("Edit", path.join(REPO, "db/schema.sql")).ruleId, "no-db");
  });
  test("allow rule cannot override a built-in ask", () => {
    const c = decider({ permissions: { rules: [{ id: "all-git", decision: "allow", tools: ["Bash"], command: "^git\\b" }] } });
    assert.equal(c.bash("git push origin feature/x").decision, "ask");
  });
  test("disabling an unlocked rule lets an allow rule take over", () => {
    const c = decider({
      permissions: { disable: ["ask-git-history"], rules: [{ id: "commit", decision: "allow", tools: ["Bash"], command: "^git commit\\b" }] },
    });
    assert.equal(c.bash("git commit -m x").decision, "allow");
  });
  test("locked and unknown rules cannot be disabled", () => {
    assert.throws(() => decider({ permissions: { disable: ["deny-force-push-protected"] } }), /locked/);
    assert.throws(() => decider({ permissions: { disable: ["no-such-rule"] } }), /unknown rule/);
  });
});
