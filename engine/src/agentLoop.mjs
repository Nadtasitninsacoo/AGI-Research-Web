// The agent reasoning loop: model <-> tools, with scope + policy enforced on
// every command and every step logged to agent_logs.

// Stop after this many consecutive tool failures/refusals with no progress
// (prevents the model from flailing across blocked targets forever).
const NO_PROGRESS_LIMIT = 5;

/** A tool result that made no progress: a refusal/block/error, or a command
 *  that executed but failed (non-zero / terminated exit). */
export function isUnproductive(result) {
  if (typeof result !== "string") return false;
  const r = result.trim();
  if (/^(REFUSED|NOT RUN|ERROR)\b/i.test(r)) return true;
  if (/\bexit=(?:(?!0\b)-?\d+|null)\b/.test(r)) return true;
  return false;
}

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chat, toolArgs } from "./ollama.mjs";
import { buildSystemPrompt } from "./systemPrompt.mjs";
import { checkScope } from "./scope.mjs";
import { decide } from "./policy.mjs";
import { runCommand, SHELL_NAMES, defaultShell } from "./shell.mjs";
import { config } from "./config.mjs";
import { log } from "./logger.mjs";
import { execute } from "./db.mjs";
import { requestAndWait } from "./approvals.mjs";
import { isLockdown, recordEvent, evaluateAutoResponse } from "./sentinel.mjs";
import { normalizeCommand } from "./normalize.mjs";
import { getPayloads, PAYLOAD_COUNT, CATEGORIES } from "../payloads/library.mjs";

// Tool definitions advertised to the model (OpenAI-style, understood by Ollama).
const TOOLS = [
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Run one shell command on the engagement host and get its output. " +
        "Only targets inside the authorized scope are permitted; destructive/DoS/" +
        "anti-forensic commands are blocked and intrusive ones need approval.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The exact command to run." },
          shell: { type: "string", enum: SHELL_NAMES, description: `Shell to use. Default: ${defaultShell()}. Use "wsl" for Kali/Linux tools.` },
          purpose: { type: "string", description: "One line: why this command, what you expect to learn." },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "port_scan",
      description:
        "Scan an in-scope host for open ports and service versions (nmap). Scope-enforced; returns results only.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "In-scope host or IP (or CIDR)." },
          ports: { type: "string", description: "Optional port spec, e.g. '1-1000' or '80,443'." },
          fast: { type: "boolean", description: "Quick top-ports scan (-F) instead of full -sV." },
          shell: { type: "string", enum: SHELL_NAMES, description: `Default "wsl" (Kali). Override if nmap is elsewhere.` },
        },
        required: ["target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "http_probe",
      description:
        "Inspect an in-scope web target: response headers, fetch a page, or enumerate directories. Scope-enforced.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "In-scope URL." },
          mode: { type: "string", enum: ["headers", "get", "enum"], description: "headers=HEAD, get=body, enum=directory brute." },
          wordlist: { type: "string", description: "For mode=enum: path to a wordlist." },
          shell: { type: "string", enum: SHELL_NAMES },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dns_lookup",
      description: "DNS or WHOIS recon for an in-scope domain/IP (nslookup/whois).",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Domain or IP (must be in scope)." },
          record: { type: "string", description: "A, AAAA, MX, NS, TXT, or 'whois'. Default A." },
          shell: { type: "string", enum: SHELL_NAMES },
        },
        required: ["target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file inside the engine workspace (notes, saved outputs, wordlists).",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
  },
  {
    type: "function",
    function: {
      name: "write_note",
      description: "Save a finding or note as a text file in the workspace notes/ folder.",
      parameters: {
        type: "object",
        properties: { name: { type: "string" }, content: { type: "string" } },
        required: ["name", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tls_inspect",
      description: "Inspect a scoped TLS endpoint's certificate and supported ciphers. Requires an explicit host:port.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Hostname:port or IPv4:port" },
          shell: { type: "string", enum: SHELL_NAMES },
        },
        required: ["target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "smb_enum",
      description: "Enumerate SMB shares and host/domain info on an authorized target (anonymous listing only; no credential attacks).",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Scoped hostname or IPv4 address" },
          shell: { type: "string", enum: SHELL_NAMES },
        },
        required: ["target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tech_fingerprint",
      description: "Identify observable web technologies, HTTP status, and page title for an authorized URL.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "HTTP(S) URL in the engagement scope" },
          shell: { type: "string", enum: SHELL_NAMES },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_vuln",
      description: "Bounded defensive web scan (misconfig/exposure/headers/TLS). No exploit templates, brute force, or DoS.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "HTTP(S) URL in the engagement scope" },
          shell: { type: "string", enum: SHELL_NAMES },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "subdomain_enum",
      description: "Discover subdomains passively (subfinder). An explicit wordlist enables rate-limited active ffuf vhost discovery (scope + approval apply).",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Authorized domain name" },
          wordlist: { type: "string", description: "Optional Linux wordlist path; enables active ffuf vhost fallback" },
          shell: { type: "string", enum: SHELL_NAMES },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ios_device",
      description: "Inspect connected authorized iOS devices: enumerate IDs, read device info, or list processes via Frida. Does not modify the device.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["enum", "info", "procs"], description: "enum=device IDs, info=device info, procs=Frida process list" },
          shell: { type: "string", enum: SHELL_NAMES },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_check",
      description: "Dependency-free defensive web check (bundled Python, stdlib only): HTTP security headers + TLS certificate expiry. Works without Kali tools installed; returns JSON. Needs python on the host.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "HTTP(S) URL in the engagement scope" },
          shell: { type: "string", enum: SHELL_NAMES },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "payloads",
      description:
        `Fetch non-destructive DETECTION probes from the built-in library (${PAYLOAD_COUNT} payloads across ${CATEGORIES.length} categories: ${CATEGORIES.join(", ")}). ` +
        "Call with no category to list categories, then with a category to get the probes. " +
        "Use only against in-scope targets with http_probe/run_command; the probes detect injectability, they do not damage the target.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: `One of: ${CATEGORIES.join(", ")} (or omit / "list" to see the catalog).` },
          limit: { type: "integer", minimum: 1, maximum: 200, description: "Max probes to return (default 50)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_finding",
      description: "Persist a verified security finding to the dashboard (evaluations table). Include evidence and actionable remediation.",
      parameters: {
        type: "object",
        properties: {
          run_id: { type: "integer", minimum: 1 },
          title: { type: "string", description: "Finding title" },
          severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] },
          score: { type: "number", minimum: 0, maximum: 10 },
          target: { type: "string" },
          evidence: { type: "string" },
          remediation: { type: "string" },
        },
        required: ["title", "severity", "score"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish_task",
      description: "Call when the objective is met or you are blocked. Summarizes findings for the operator.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Concise summary of what was done and concluded." },
          findings: {
            type: "array",
            description: "Notable findings.",
            items: {
              type: "object",
              properties: {
                target: { type: "string" },
                severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] },
                finding: { type: "string" },
                evidence: { type: "string" },
                remediation: { type: "string" },
              },
            },
          },
          next_steps: { type: "string", description: "Recommended next steps for the operator." },
        },
        required: ["summary"],
      },
    },
  },
];

/** Execute one run_command tool call through the full guardrail chain. */
async function execRunCommand({ args, scope, agentConfig, runParams, agentId, runId, cmdHistory }) {
  const shell = args.shell;
  const raw = String(args.command ?? "").trim();
  // Normalize before any check runs, so scope/policy see the real command and the
  // executor runs a well-formed one (strips Markdown links, fixes the PowerShell
  // curl/wget alias). See normalize.mjs.
  const command = normalizeCommand(raw, shell);
  const purpose = args.purpose ? ` — ${args.purpose}` : "";
  if (!command) return "ERROR: empty command.";
  if (command !== raw) {
    await log({ agentId, runId, level: "debug", message: `NORMALIZED: ${raw}  ->  ${command}` });
  }

  // Repeat guard: refuse an identical command that already failed this run, so a
  // retry means diagnosing and changing something — not resending the same thing.
  const historyKey = `${shell ?? ""}\u0000${command}`;
  const prior = cmdHistory?.get(historyKey);
  if (prior?.failed) {
    await log({ agentId, runId, level: "warn", message: `REPEAT BLOCKED: ${command} (already ${prior.detail})` });
    return (
      `NOT RUN — you already ran this exact command and it ${prior.detail}. ` +
      `Do not resend it unchanged. Read the earlier error/output, work out WHY it failed, then either fix the command ` +
      `(different flags, path, target, or tool) or try a different approach. If it cannot work here, say so and move on.`
    );
  }

  const remember = (detail) => cmdHistory?.set(historyKey, { failed: true, detail });

  // 0) Sentinel kill switch: while the engine is in defensive LOCKDOWN, every
  // command is halted — an operator (or the auto-response) tripped it because a
  // counter-attack / hijack is suspected. Checked first, before any other gate.
  if (await isLockdown()) {
    await log({ agentId, runId, level: "warn", message: `LOCKDOWN BLOCK: ${command}` });
    await recordEvent({ kind: "lockdown_block", severity: "warn", runId, agentId, command });
    remember("was refused — engine in lockdown");
    return "NOT RUN — the engine is in defensive LOCKDOWN. All commands are halted until an operator lifts it.";
  }

  // 1) Scope / rules of engagement.
  const sc = checkScope(command, scope);
  if (!sc.ok) {
    await log({ agentId, runId, level: "warn", message: `SCOPE BLOCK: ${command}`, context: { outOfScope: sc.outOfScope } });
    await recordEvent({ kind: "scope_block", severity: "high", runId, agentId, command, detail: `out of scope: ${sc.outOfScope.join(", ")}` });
    await evaluateAutoResponse({ runId, agentId });
    remember("was refused as out of scope");
    return `REFUSED (out of scope): ${sc.reason}`;
  }

  // 2) Risk policy.
  const d = decide(command, agentConfig, runParams);
  if (d.decision === "deny") {
    await log({ agentId, runId, level: "warn", message: `POLICY DENY [${d.tier}]: ${command}`, context: { reason: d.reason } });
    // A forbidden attempt is the strongest hijack signal — record critical and let
    // the auto-response decide whether a burst warrants lockdown.
    await recordEvent({ kind: "policy_deny", severity: "critical", runId, agentId, command, detail: d.reason });
    await evaluateAutoResponse({ runId, agentId });
    remember("was denied by policy");
    return `REFUSED: ${d.reason}`;
  }
  if (d.decision === "needs_approval") {
    await log({ agentId, runId, level: "warn", message: `NEEDS APPROVAL [${d.tier}]: ${command}`, context: { reason: d.reason } });
    const verdict = await requestAndWait({
      runId, agentId, command, reason: d.reason, tier: d.tier,
      timeoutMs: config.worker.approvalTimeoutMs, pollMs: config.worker.approvalPollMs,
    });
    if (verdict.decision !== "approved") {
      await log({ agentId, runId, level: "warn", message: `APPROVAL ${verdict.decision.toUpperCase()} [${d.tier}]: ${command}` });
      await recordEvent({ kind: "approval_denied", severity: "warn", runId, agentId, command, detail: `approval ${verdict.decision}` });
      remember(`was not approved (${verdict.decision})`);
      return `NOT RUN — approval ${verdict.decision}. ${d.reason}`;
    }
    await log({ agentId, runId, level: "info", message: `APPROVED by operator [${d.tier}]: ${command}` });
    // Approved: fall through to the target check and execution below.
  }

  // 2b) Fail closed: an active/intrusive network action must name at least one
  // recognizable target (localhost counts). A command with NO parseable target
  // (e.g. an obfuscated decimal/hex IP, or a missing target) is refused rather
  // than run blind. In-scope remote targets and localhost both pass.
  if ((d.tier === "active" || d.tier === "intrusive") && sc.targets.length === 0) {
    await log({ agentId, runId, level: "warn", message: `NO VERIFIABLE TARGET [${d.tier}]: ${command}` });
    remember("was refused for naming no verifiable target");
    return "NOT RUN — this network action does not name a recognizable target " +
      "(an obfuscated or missing target is refused). Restate with an explicit in-scope host/IP.";
  }

  // 3) Execute.
  await log({ agentId, runId, level: "info", message: `RUN [${d.tier}] (${shell ?? defaultShell()}) ${command}${purpose}`, context: { targets: sc.targets } });
  const r = await runCommand({ command, shell });
  await log({
    agentId, runId, level: r.exitCode === 0 ? "info" : "warn",
    message: `EXIT ${r.exitCode}${r.timedOut ? " (timeout)" : ""} [${r.shell}] ${command}`,
    context: { exitCode: r.exitCode, timedOut: r.timedOut },
  });

  const failed = r.exitCode !== 0 || r.timedOut;
  cmdHistory?.set(historyKey, { failed, detail: `returned exit=${r.exitCode}${r.timedOut ? " (timeout)" : ""}` });

  const parts = [`$ ${command}`, `# shell=${r.shell} exit=${r.exitCode}${r.timedOut ? " TIMED_OUT" : ""}`];
  if (r.stdout) parts.push(`--- stdout ---\n${r.stdout}`);
  if (r.stderr) parts.push(`--- stderr ---\n${r.stderr}`);
  if (!r.stdout && !r.stderr) parts.push("(no output)");
  if (failed) parts.push("# NOTE: this command failed. Diagnose the error above before any retry; do not resend it unchanged.");
  return parts.join("\n");
}

/** Read a text file, confined to the engine workspace (no path traversal). */
async function readWorkspaceFile(rel) {
  if (!rel) return "ERROR: path required.";
  const root = path.resolve(config.worker.workdir);
  const target = path.resolve(root, rel);
  if (target !== root && !target.startsWith(root + path.sep)) {
    return "REFUSED: path is outside the workspace.";
  }
  try {
    const data = await readFile(target, "utf8");
    const cap = config.worker.maxOutputChars;
    return data.length > cap ? `${data.slice(0, cap)}\n...[truncated at ${cap} chars]` : data;
  } catch (err) {
    return `ERROR: ${err?.message ?? err}`;
  }
}

/** Save a note into workspace notes/, with a sanitized filename. */
async function writeWorkspaceNote(nameRaw, content, { agentId, runId }) {
  const safe = (nameRaw.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "note").replace(/\.+$/, "");
  const root = path.resolve(config.worker.workdir);
  const dir = path.join(root, "notes");
  const file = path.join(dir, safe.endsWith(".txt") ? safe : `${safe}.txt`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(file, content, "utf8");
    await log({ agentId, runId, level: "info", message: `NOTE saved: notes/${path.basename(file)}` });
    return `Saved note to notes/${path.basename(file)} (${content.length} chars).`;
  } catch (err) {
    return `ERROR: ${err?.message ?? err}`;
  }
}

/**
 * Run the agent to completion for one experiment run.
 * @returns {Promise<{status:"succeeded"|"failed", summary:string, findings:any[], metrics:object}>}
 */
export async function runAgent({ runId, agentId, agentName, model, objective, scope, agentConfig, runParams, toolsEnabled }) {
  const started = Date.now();
  const systemPrompt = buildSystemPrompt({
    agentName,
    agentConfig,
    scope,
    defaultShell: defaultShell(),
    autoApproveIntrusive: config.worker.autoApproveIntrusive,
    toolsEnabled,
  });
  // Text-only research agents get no shell tools (matches the base prompt).
  // Tool-enabled agents get run_command + finish_task.
  const tools = toolsEnabled ? TOOLS : undefined;
  const maxSteps = toolsEnabled ? config.worker.maxSteps : 1;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: objective },
  ];

  let inputTokens = 0;
  let outputTokens = 0;
  let findings = [];
  let summary = "";
  let status = "failed";
  let noProgress = 0;
  // Evidence signals: how many real tool commands ran and how many produced a
  // usable (non-refused, non-error) result. The orchestrator uses these to tell
  // a confirmed finding from an unbacked claim.
  let commandsRun = 0;
  let commandsOk = 0;
  // Remember each command's outcome this run, to refuse re-running an identical
  // command that already failed (forces the agent to diagnose and change, not loop).
  const cmdHistory = new Map();
  // Guardrail blocks: commands stopped by scope / policy / approval. These are
  // authorization boundaries, not technical failures, so the orchestrator must
  // escalate them to a human — never "retry around" them.
  let blocked = 0;

  for (let step = 1; step <= maxSteps; step++) {
    let reply;
    try {
      reply = await chat({ model, messages, tools });
    } catch (err) {
      summary = `Model call failed: ${err?.message ?? err}`;
      await log({ agentId, runId, level: "error", message: summary });
      break;
    }
    inputTokens += reply.promptTokens;
    outputTokens += reply.outputTokens;

    const msg = reply.message ?? {};
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls.length ? calls : undefined });

    if (msg.content) {
      await log({ agentId, runId, level: "debug", message: `THINK: ${String(msg.content).slice(0, 2000)}` });
    }

    // No tools called: treat the assistant text as the final answer.
    if (!calls.length) {
      summary = String(msg.content ?? "").trim() || "(model returned no content)";
      status = "succeeded";
      break;
    }

    let finished = false;
    for (const call of calls) {
      const name = call?.function?.name;
      const args = toolArgs(call);

      if (name === "finish_task") {
        summary = String(args.summary ?? "").trim() || "(no summary)";
        findings = Array.isArray(args.findings) ? args.findings : [];
        if (args.next_steps) summary += `\n\nNext steps: ${args.next_steps}`;
        status = "succeeded";
        finished = true;
        break;
      }

      const ctx = { scope, agentConfig, runParams, agentId, runId, cmdHistory };
      let result;
      switch (name) {
        case "run_command":
          result = await execRunCommand({ args, ...ctx });
          break;
        case "port_scan": {
          const t = String(args.target ?? "").trim();
          if (!t) { result = "ERROR: target required."; break; }
          const flags = args.fast ? "-F" : "-sV";
          const ports = args.ports ? ` -p ${String(args.ports).replace(/[^0-9,\-]/g, "")}` : "";
          result = await execRunCommand({ args: { command: `nmap ${flags}${ports} ${t}`, shell: args.shell ?? "wsl", purpose: "port scan" }, ...ctx });
          break;
        }
        case "http_probe": {
          const u = String(args.url ?? "").trim();
          if (!u) { result = "ERROR: url required."; break; }
          let cmd;
          if (args.mode === "enum") cmd = `gobuster dir -u ${u} -w ${args.wordlist || "/usr/share/wordlists/dirb/common.txt"} -q`;
          else if (args.mode === "get") cmd = `curl -sS -L --max-time 30 ${u}`;
          else cmd = `curl -sS -I -L --max-time 20 ${u}`;
          result = await execRunCommand({ args: { command: cmd, shell: args.shell ?? "wsl", purpose: "http probe" }, ...ctx });
          break;
        }
        case "dns_lookup": {
          const t = String(args.target ?? "").trim();
          if (!t) { result = "ERROR: target required."; break; }
          const rec = String(args.record ?? "A").toLowerCase();
          const cmd = rec === "whois" ? `whois ${t}` : `nslookup -type=${(rec.toUpperCase().replace(/[^A-Z]/g, "") || "A")} ${t}`;
          result = await execRunCommand({ args: { command: cmd, shell: args.shell, purpose: "dns/whois recon" }, ...ctx });
          break;
        }
        case "read_file":
          result = await readWorkspaceFile(String(args.path ?? ""));
          break;
        case "payloads": {
          // Read-only: hand the model detection probes; it applies them with
          // the scope-gated tools. Nothing is executed here.
          const pr = getPayloads({ category: args.category, limit: args.limit });
          result = pr.payloads
            ? `Category "${pr.category}" (${pr.count}/${pr.total}):\n${pr.payloads.map((p) => `- ${p}`).join("\n")}`
            : pr.categories
              ? `${pr.message}\nCategories:\n${pr.categories.map((c) => `- ${c}`).join("\n")}`
              : pr.message ?? "No payloads.";
          break;
        }
        case "write_note":
          result = await writeWorkspaceNote(String(args.name ?? ""), String(args.content ?? ""), { agentId, runId });
          break;
        case "tls_inspect": {
          let endpoint; let shell;
          try { endpoint = securityHostPort(args.target); shell = securityShell(args.shell); }
          catch (error) { result = `ERROR: ${error.message}`; break; }
          const command =
            `if command -v sslscan >/dev/null 2>&1; then sslscan --no-colour ${endpoint.target}; ` +
            `elif command -v openssl >/dev/null 2>&1; then openssl s_client -connect ${endpoint.target} -servername ${endpoint.host} -brief -showcerts </dev/null 2>&1 | head -n 80; ` +
            `else echo 'ERROR: install sslscan or openssl in Kali/WSL'; fi`;
          result = await execRunCommand({ args: { command, shell, purpose: "TLS certificate and cipher inspection" }, ...ctx });
          break;
        }
        case "smb_enum": {
          let target; let shell;
          try { target = securityHost(args.target); shell = securityShell(args.shell); }
          catch (error) { result = `ERROR: ${error.message}`; break; }
          const command =
            `if command -v enum4linux-ng >/dev/null 2>&1; then enum4linux-ng -A ${target}; ` +
            `elif command -v smbmap >/dev/null 2>&1; then smbmap -H ${target}; ` +
            `elif command -v smbclient >/dev/null 2>&1; then smbclient -L //${target} -N; ` +
            `else echo 'ERROR: install enum4linux-ng, smbmap, or smbclient in Kali/WSL'; fi`;
          result = await execRunCommand({ args: { command, shell, purpose: "SMB and domain enumeration" }, ...ctx });
          break;
        }
        case "tech_fingerprint": {
          let url; let shell;
          try { url = securityUrl(args.url); shell = securityShell(args.shell); }
          catch (error) { result = `ERROR: ${error.message}`; break; }
          const command =
            `if command -v whatweb >/dev/null 2>&1; then whatweb --no-errors --color=never ${url}; ` +
            `elif command -v httpx >/dev/null 2>&1; then httpx -silent -u ${url} -title -tech-detect -status-code; ` +
            `else echo 'ERROR: install WhatWeb or ProjectDiscovery httpx in Kali/WSL'; fi`;
          result = await execRunCommand({ args: { command, shell, purpose: "Web technology fingerprinting" }, ...ctx });
          break;
        }
        case "web_vuln": {
          let url; let shell;
          try { url = securityUrl(args.url); shell = securityShell(args.shell); }
          catch (error) { result = `ERROR: ${error.message}`; break; }
          const command =
            `if command -v nuclei >/dev/null 2>&1; then nuclei -u ${url} -tags misconfig,exposure,headers,ssl -severity info,low,medium -exclude-tags dos,fuzz,intrusive,bruteforce,exploit -no-interactsh; ` +
            `elif command -v nikto >/dev/null 2>&1; then nikto -host ${url} -nointeractive; ` +
            `else echo 'ERROR: install Nuclei or Nikto in Kali/WSL'; fi`;
          result = await execRunCommand({ args: { command, shell, purpose: "Defensive web vulnerability scan; approval may be required" }, ...ctx });
          break;
        }
        case "subdomain_enum": {
          let domain; let shell; let wordlist = "";
          try {
            domain = securityHost(args.domain);
            shell = securityShell(args.shell);
            if (args.wordlist != null && String(args.wordlist).trim()) wordlist = securityWordlist(args.wordlist);
          } catch (error) { result = `ERROR: ${error.message}`; break; }
          let command = `if command -v subfinder >/dev/null 2>&1; then subfinder -d ${domain} -silent`;
          if (wordlist) {
            command += `; elif command -v ffuf >/dev/null 2>&1; then ffuf -w ${wordlist} -u https://${domain}/ -H "Host: FUZZ.${domain}" -mc 200,204,301,302,307,401,403 -rate 10 -noninteractive -s`;
          }
          command += `; else echo 'ERROR: install subfinder in Kali/WSL; ffuf fallback also requires an explicit wordlist'; fi`;
          result = await execRunCommand({ args: { command, shell, purpose: wordlist ? "Subdomain discovery with possible active vhost enumeration; approval required" : "Passive subdomain enumeration" }, ...ctx });
          break;
        }
        case "ios_device": {
          const action = String(args.action ?? "").trim();
          let shell;
          try { shell = securityShell(args.shell); }
          catch (error) { result = `ERROR: ${error.message}`; break; }
          const commands = {
            enum: "if command -v idevice_id >/dev/null 2>&1; then idevice_id -l; else echo 'ERROR: install libimobiledevice in Kali/WSL'; fi",
            info: "if command -v ideviceinfo >/dev/null 2>&1; then ideviceinfo; else echo 'ERROR: install libimobiledevice in Kali/WSL'; fi",
            procs: "if command -v frida-ps >/dev/null 2>&1; then frida-ps -U; else echo 'ERROR: install frida-tools in Kali/WSL'; fi",
          };
          if (!Object.prototype.hasOwnProperty.call(commands, action)) { result = "ERROR: action must be enum, info, or procs."; break; }
          result = await execRunCommand({ args: { command: commands[action], shell, purpose: `Authorized iOS device inventory: ${action}` }, ...ctx });
          break;
        }
        case "web_check": {
          let url;
          try { url = securityUrl(args.url); }
          catch (error) { result = `ERROR: ${error.message}`; break; }
          const script = path.join(config.worker.workdir, "engine", "pyscan", "web_check.py").replace(/\\/g, "/");
          const py = process.platform === "win32" ? "python" : "python3";
          // -I isolates Python from cwd/env so a planted module cannot hijack imports.
          const command = `${py} -I "${script}" "${url}"`;
          result = await execRunCommand({ args: { command, shell: args.shell, purpose: "defensive web check (headers + TLS)" }, ...ctx });
          break;
        }
        case "record_finding": {
          const title = String(args.title ?? "").trim();
          const severity = String(args.severity ?? "").trim().toLowerCase();
          const score = Number(args.score);
          const allowed = new Set(["info", "low", "medium", "high", "critical"]);
          const runId2 = Number(args.run_id ?? ctx.runId);
          const target = String(args.target ?? "").trim();
          const evidence = String(args.evidence ?? "").trim();
          const remediation = String(args.remediation ?? "").trim();
          if (!title || title.length > 255) { result = "ERROR: title is required and must be at most 255 characters."; break; }
          if (!allowed.has(severity)) { result = "ERROR: severity must be info, low, medium, high, or critical."; break; }
          if (!Number.isFinite(score) || score < 0 || score > 10) { result = "ERROR: score must be a number between 0 and 10."; break; }
          if (!Number.isSafeInteger(runId2) || runId2 < 1) { result = "ERROR: a valid run_id or ctx.runId is required."; break; }
          if (target.length > 2048 || evidence.length > 20000 || remediation.length > 10000) { result = "ERROR: target, evidence, or remediation exceeds the allowed length."; break; }
          const details = JSON.stringify({ severity, target: target || null, evidence: evidence || null, remediation: remediation || null });
          try {
            // evaluations.benchmark is VARCHAR(160); keep the title within it.
            await execute(
              `INSERT INTO evaluations (run_id, benchmark, score, details) VALUES (?, ?, ?, ?)`,
              [runId2, title.slice(0, 160), score, details],
            );
            result = `Finding recorded: "${title}" (run_id=${runId2}, score=${score}).`;
          } catch (error) {
            result = `ERROR: failed to record finding: ${error?.message ?? error}`;
          }
          break;
        }
        default:
          result = `ERROR: unknown tool "${name}".`;
      }
      messages.push({ role: "tool", name, content: result });
      const unproductive = isUnproductive(result);
      noProgress = unproductive ? noProgress + 1 : 0;
      // report_finding records a claim; it is not itself evidence of a command.
      if (name !== "report_finding") {
        commandsRun++;
        if (!unproductive) commandsOk++;
      }
      // A scope/policy/approval refusal is an authorization boundary, tracked apart
      // from ordinary errors so the orchestrator escalates rather than retries it.
      if (/^(REFUSED|NOT RUN)\b/i.test(String(result).trim())) blocked++;
    }
    if (finished) break;

    // Loop guard: too many consecutive failures/refusals -> stop, don't flail.
    if (noProgress >= NO_PROGRESS_LIMIT) {
      summary = `Stopped after ${noProgress} consecutive tool failures/refusals with no progress. ` +
        "This usually means the target is out of scope or the tool is unavailable. Reporting to the operator.";
      status = "failed";
      await log({ agentId, runId, level: "warn", message: `Loop guard tripped (${noProgress} unproductive calls); stopping.` });
      break;
    }

    if (step === maxSteps && !summary) {
      summary = "Reached the maximum number of steps before finishing.";
      status = "failed";
      await log({ agentId, runId, level: "warn", message: "Max steps reached." });
    }
  }

  // Parse the mandatory structured JSON out of the final text, if present.
  const structured = parseStructured(summary);

  const metrics = {
    output: structured?.content || structured?.summary || summary,
    structured: structured ?? null,
    findings,
    confidence: typeof structured?.confidence === "number" ? structured.confidence : null,
    accuracy: typeof structured?.confidence === "number" ? structured.confidence : undefined,
    evidence: { commandsRun, commandsOk, blocked },
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - started,
  };
  return { status, summary, findings, metrics, evidence: { commandsRun, commandsOk, blocked } };
}

/** Extract the structured JSON object from a model reply (```json block or raw). */
function parseStructured(text) {
  if (!text || typeof text !== "string") return null;
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  // Try the whole candidate, then the first {...} span.
  for (const chunk of [candidate, candidate.match(/\{[\s\S]*\}/)?.[0]]) {
    if (!chunk) continue;
    try {
      const obj = JSON.parse(chunk);
      if (obj && typeof obj === "object") return obj;
    } catch {
      /* keep trying */
    }
  }
  return null;
}

// ============================================================
// Shared validation helpers for the security tool wrappers.
// They reject unsupported shell metacharacters rather than trying to escape
// arbitrary input. (Function declarations hoist, so order does not matter.)
// ============================================================

// Security tools use Linux shell syntax -> only wsl/bash are allowed.
function securityShell(value) {
  const shell = String(value ?? "wsl").trim();
  if (!["wsl", "bash"].includes(shell)) {
    throw new Error("This security tool requires shell 'wsl' or 'bash'.");
  }
  return shell;
}

// Validate a DNS hostname or IPv4 address.
function securityHost(value) {
  const host = String(value ?? "").trim();
  if (
    !host ||
    host.length > 253 ||
    host.startsWith("-") ||
    !/^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/.test(host)
  ) {
    throw new Error("Invalid hostname or IPv4 target.");
  }
  return host;
}

// Validate an explicit TLS host:port (DNS/IPv4 only; IPv6 needs its own path).
function securityHostPort(value) {
  const target = String(value ?? "").trim();
  const match = target.match(/^([A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?):([0-9]{1,5})$/);
  if (!match) throw new Error("Target must be a hostname:port or IPv4:port.");
  const host = securityHost(match[1]);
  const port = Number(match[2]);
  if (port < 1 || port > 65535) throw new Error("Port must be between 1 and 65535.");
  return { host, port, target: `${host}:${port}` };
}

// Accept HTTP(S) URLs without query strings or fragments.
function securityUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 2048 || /[\s"'`$\;|&<>()[\]{}!*]/.test(raw)) {
    throw new Error("Invalid URL: unsupported characters.");
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("A valid HTTP(S) URL is required.");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !/^[A-Za-z0-9.-]+$/.test(parsed.hostname) ||
    !/^(?:\/[A-Za-z0-9._~/-]*)?$/.test(parsed.pathname) ||
    parsed.pathname.split("/").includes("..")
  ) {
    throw new Error("URL must be HTTP(S), without credentials, query, fragment, or unsafe path.");
  }
  return `${parsed.origin}${parsed.pathname}`;
}

// Accept a simple relative/absolute Linux wordlist path.
function securityWordlist(value) {
  const wl = String(value ?? "").trim();
  if (
    !wl ||
    wl.startsWith("-") ||
    wl.length > 512 ||
    !/^\/?[A-Za-z0-9_./-]+$/.test(wl) ||
    wl.split("/").includes("..")
  ) {
    throw new Error("Invalid wordlist path.");
  }
  return wl;
}
