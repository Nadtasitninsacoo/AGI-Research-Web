import { isInside } from "../util/paths.js";
import { classifyForcePush, isSweepingRm } from "./guards.js";
import { searchPatterns } from "./rules.js";
import { exposesSecret, isSecretGlob, isSecretPath } from "./secrets.js";
import type { Rule, Subject } from "./types.js";

const FILE_WRITE = ["Write", "Edit", "NotebookEdit"];
const FILE_TOOLS = ["Read", "Glob", "Grep", ...FILE_WRITE];

const shell = (re: RegExp) => (s: Subject) => s.segment !== undefined && re.test(s.segment);
const inAny = (p: string, roots: string[]) => roots.some((r) => isInside(p, r));

/**
 * Built-in policy. Precedence is deny > ask > allow, so order inside a group
 * only picks which reason is shown. A call no rule allows falls back to ask.
 */
export const BUILTIN_RULES: Rule[] = [
  // ── deny (locked) ──
  {
    id: "deny-secret-files",
    decision: "deny",
    locked: true,
    tools: FILE_TOOLS,
    reason: "Secret files (.env*) are off-limits. Scripts load them themselves; never print their values.",
    matches: (s) => (s.path !== undefined && isSecretPath(s.path)) || searchPatterns(s).some(isSecretGlob),
  },
  {
    id: "deny-secret-shell",
    decision: "deny",
    locked: true,
    tools: ["Bash"],
    reason: "This command would print a secret (.env file, credential variable or the whole environment).",
    matches: (s) => s.segment !== undefined && exposesSecret(s.segment),
  },
  {
    id: "deny-sweeping-rm",
    decision: "deny",
    locked: true,
    tools: ["Bash"],
    reason: "Recursive delete of a root, home or whole tree is never allowed.",
    matches: (s) => s.segment !== undefined && isSweepingRm(s.segment),
  },
  {
    id: "deny-force-push-protected",
    decision: "deny",
    locked: true,
    tools: ["Bash"],
    reason: "Force push (or ref deletion) that can reach main/master is never allowed. Name a feature branch explicitly.",
    matches: (s) => s.segment !== undefined && classifyForcePush(s.segment) === "protected",
  },

  // ── ask ──
  {
    id: "ask-outbound",
    decision: "ask",
    locked: true,
    tools: ["Bash"],
    reason: "Sends data to an external system.",
    matches: shell(
      /^(curl|wget|ssh|scp|sftp|rsync|ftp|nc|ncat|telnet|sendmail|mailx?)\b|\bgh\s+(pr|issue|api|gist|release)\b|\bInvoke-(WebRequest|RestMethod)\b|\bnpm\s+publish\b/i,
    ),
  },
  {
    id: "ask-self-modify",
    decision: "ask",
    locked: true,
    tools: FILE_WRITE,
    reason: "Changes the orchestrator's own code, prompts or config.",
    matches: (s, ctx) => s.path !== undefined && inAny(s.path, ctx.protectedRoots),
  },
  {
    id: "ask-write-outside-project",
    decision: "ask",
    tools: FILE_WRITE,
    reason: "Writes outside the project folder.",
    matches: (s, ctx) => s.path !== undefined && !inAny(s.path, ctx.writableRoots),
  },
  {
    id: "ask-force-push",
    decision: "ask",
    tools: ["Bash"],
    reason: "Force push rewrites history on the remote.",
    matches: (s) => s.segment !== undefined && classifyForcePush(s.segment) === "other",
  },
  {
    id: "ask-git-history",
    decision: "ask",
    tools: ["Bash"],
    reason: "Commits, pushes or rewrites git history.",
    matches: shell(
      /^git\s+(-C\s+\S+\s+)?(commit|push|merge|rebase|reset|revert|tag|cherry-pick|am|clean|stash|checkout|switch|restore|branch\s+-[dDmM])\b/,
    ),
  },
  {
    id: "ask-delete",
    decision: "ask",
    tools: ["Bash"],
    reason: "Deletes files.",
    matches: shell(/^(sudo\s+)?(rm|rmdir|unlink|del|erase|rd|shred)\b|^git\s+rm\b|\s-delete\b|\bRemove-Item\b/i),
  },
  {
    id: "ask-db-write",
    decision: "ask",
    tools: ["Bash"],
    reason: "May write to a database.",
    matches: shell(/\b(mysql|mysqladmin|psql|sqlite3|mongosh?|redis-cli)\b|\bprisma\s+(migrate|db)\b|\bnpm\s+run\s+(db:\S+|reset-demo|seed\S*)/i),
  },
  {
    id: "ask-deploy",
    decision: "ask",
    tools: ["Bash"],
    reason: "Deploys or changes infrastructure.",
    matches: shell(/\b(deploy\S*|vercel|netlify|flyctl|kubectl|helm|terraform|pulumi|serverless)\b|\bdocker\s+push\b/i),
  },

  // ── allow ──
  { id: "allow-read", decision: "allow", tools: ["Read", "Glob", "Grep"], reason: "Read-only file access.", matches: () => true },
  {
    id: "allow-write-project",
    decision: "allow",
    tools: FILE_WRITE,
    reason: "Edit inside the project.",
    matches: (s, ctx) => s.path !== undefined && inAny(s.path, ctx.writableRoots),
  },
  {
    id: "allow-checks",
    decision: "allow",
    tools: ["Bash"],
    reason: "Type check, lint or test.",
    matches: shell(/^(npx\s+)?(tsc|eslint|vitest\s+run|jest|tsx\s+--test)\b|^npm\s+(test|run\s+(test|lint|typecheck)(:\S+)?)\b|^node\s+--test\b/),
  },
  {
    id: "allow-git-read",
    decision: "allow",
    tools: ["Bash"],
    reason: "Read-only git.",
    matches: shell(
      /^git\s+(status|diff|log|show|blame|ls-files|rev-parse|fetch)\b|^git\s+branch(\s+(-a|-r|-vv?|--list|--show-current))*$|^git\s+remote(\s+-v)?$/,
    ),
  },
  {
    id: "allow-shell-read",
    decision: "allow",
    tools: ["Bash"],
    reason: "Read-only shell command.",
    matches: shell(/^(ls|pwd|cat|head|tail|wc|echo|which|cd|dir|file|stat|du|df|tree|sort|uniq|grep|rg)(\s|$)/),
  },
];
