// ─────────────────────────────────────────────────────────────────────────────
// TOOL REGISTRY (manifest) — the "Command Center" catalog of cyber tools the
// agent can discover and use. ADD A NEW TOOL by appending an entry here and
// installing its binary (e.g. in Kali/WSL). The agent picks it up automatically
// via list_tools / run_tool.
//
// IMPORTANT — governance is NOT optional:
//   • Every tool runs through the engine's scope + policy + approval pipeline
//     (execRunCommand). A tool listed here is NOT a bypass.
//   • risk: "passive"  → recon/read-only, no packets that alter the target.
//           "active"   → sends traffic to the target; scopeRequired.
//           "intrusive"→ may change state / is noisy; scopeRequired + approval.
//   • scopeRequired tools only run against targets inside the authorized scope.
//
// Each entry:
//   id          unique short id used by the agent
//   name        human label
//   category    recon | scan | web | exploit | util
//   bin         binary name used for the "installed?" check
//   shell       "wsl" (Kali/Linux) | "powershell" | "bash"
//   risk        "passive" | "active" | "intrusive"
//   scopeRequired  must the target be in authorized scope
//   usage       one-line hint for the agent
//   build(target, extra) → the exact command string (keep target as a single arg)
// ─────────────────────────────────────────────────────────────────────────────

/** Strip shell control characters so a tool call can't chain extra commands. */
export function sanitizeArg(v) {
  return String(v ?? "")
    .replace(/[;&|`$><\n\r\\]/g, "")
    .replace(/\$\(/g, "")
    .trim();
}

export const TOOL_REGISTRY = [
  // ── Recon / passive ────────────────────────────────────────────────
  {
    id: "whois",
    name: "WHOIS",
    category: "recon",
    bin: "whois",
    shell: "wsl",
    risk: "passive",
    scopeRequired: false,
    usage: "Domain/IP registration lookup (passive).",
    build: (t) => `whois ${sanitizeArg(t)}`,
  },
  {
    id: "subfinder",
    name: "Subfinder",
    category: "recon",
    bin: "subfinder",
    shell: "wsl",
    risk: "passive",
    scopeRequired: false,
    usage: "Passive subdomain discovery for a domain.",
    build: (t) => `subfinder -silent -d ${sanitizeArg(t)}`,
  },
  {
    id: "theharvester",
    name: "theHarvester",
    category: "recon",
    bin: "theHarvester",
    shell: "wsl",
    risk: "passive",
    scopeRequired: false,
    usage: "OSINT emails/hosts for a domain.",
    build: (t) => `theHarvester -d ${sanitizeArg(t)} -b all`,
  },
  {
    id: "httpx",
    name: "httpx",
    category: "recon",
    bin: "httpx",
    shell: "wsl",
    risk: "active",
    scopeRequired: true,
    usage: "Probe a host/URL for live HTTP(S) + tech (sends requests).",
    build: (t) => `httpx -silent -title -tech-detect -status-code -u ${sanitizeArg(t)}`,
  },
  {
    id: "whatweb",
    name: "WhatWeb",
    category: "recon",
    bin: "whatweb",
    shell: "wsl",
    risk: "active",
    scopeRequired: true,
    usage: "Fingerprint a web target's technologies.",
    build: (t) => `whatweb --no-errors ${sanitizeArg(t)}`,
  },

  // ── Port / service scanning / active ───────────────────────────────
  {
    id: "nmap",
    name: "Nmap",
    category: "scan",
    bin: "nmap",
    shell: "wsl",
    risk: "active",
    scopeRequired: true,
    usage: "Port + service/version scan of an in-scope host.",
    build: (t, extra) => `nmap -sV -T4 ${sanitizeArg(extra) || "-F"} ${sanitizeArg(t)}`,
  },
  {
    id: "naabu",
    name: "naabu",
    category: "scan",
    bin: "naabu",
    shell: "wsl",
    risk: "active",
    scopeRequired: true,
    usage: "Fast port discovery (SYN) for an in-scope host.",
    build: (t) => `naabu -silent -host ${sanitizeArg(t)}`,
  },

  // ── Web testing / active & intrusive ───────────────────────────────
  {
    id: "nuclei",
    name: "Nuclei",
    category: "web",
    bin: "nuclei",
    shell: "wsl",
    risk: "active",
    scopeRequired: true,
    usage: "Template-based vuln checks against an in-scope URL.",
    build: (t) => `nuclei -silent -u ${sanitizeArg(t)}`,
  },
  {
    id: "nikto",
    name: "Nikto",
    category: "web",
    bin: "nikto",
    shell: "wsl",
    risk: "intrusive",
    scopeRequired: true,
    usage: "Web server misconfig/vuln scan (noisy).",
    build: (t) => `nikto -host ${sanitizeArg(t)}`,
  },
  {
    id: "gobuster",
    name: "Gobuster",
    category: "web",
    bin: "gobuster",
    shell: "wsl",
    risk: "intrusive",
    scopeRequired: true,
    usage: "Directory/file brute force on an in-scope URL.",
    build: (t, extra) =>
      `gobuster dir -q -u ${sanitizeArg(t)} -w ${sanitizeArg(extra) || "/usr/share/wordlists/dirb/common.txt"}`,
  },
  {
    id: "ffuf",
    name: "ffuf",
    category: "web",
    bin: "ffuf",
    shell: "wsl",
    risk: "intrusive",
    scopeRequired: true,
    usage: "Fuzz URLs/params (requires FUZZ keyword in target).",
    build: (t, extra) =>
      `ffuf -s -u ${sanitizeArg(t)} -w ${sanitizeArg(extra) || "/usr/share/wordlists/dirb/common.txt"}`,
  },

  // ── Exploitation / intrusive (scope + approval enforced) ───────────
  {
    id: "sqlmap",
    name: "sqlmap",
    category: "exploit",
    bin: "sqlmap",
    shell: "wsl",
    risk: "intrusive",
    scopeRequired: true,
    usage: "SQL injection testing of an in-scope URL (authorized only).",
    build: (t, extra) => `sqlmap -u ${sanitizeArg(t)} --batch ${sanitizeArg(extra)}`.trim(),
  },
];

/** A tool entry by id, or undefined. */
export function getToolDef(id) {
  const key = String(id ?? "").trim().toLowerCase();
  return TOOL_REGISTRY.find((t) => t.id === key);
}
