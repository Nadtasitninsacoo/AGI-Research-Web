// Command risk policy.
//
// Classifies a shell command into a tier and decides whether it may run.
// This is a safety net for an operator-driven agent, not a sandbox: it blocks
// the clearly destructive / out-of-contract classes outright and routes
// higher-impact actions through an approval gate, while letting ordinary
// recon and enumeration proceed (and always logging it).
//
// Tiers:
//   recon      read-only info gathering (whoami, dig, nmap -sV, whatweb...)
//   active     enumeration that touches the target but is non-destructive
//   intrusive  exploitation / credential attacks / writes to the target
//   forbidden  destructive, denial-of-service, mass-targeting, anti-forensics
//
// `forbidden` is always denied. `intrusive` needs an approval token unless
// ENGINE_AUTO_APPROVE_INTRUSIVE is set. recon/active run (in scope) and log.

import { config } from "./config.mjs";

// Always-deny patterns. These map to the uses this engine will not perform:
// destruction of data/systems, denial of service, indiscriminate mass
// targeting, and anti-forensic log tampering. Kept deliberately conservative.
const FORBIDDEN = [
  // Filesystem / disk destruction
  { re: /\brm\s+-[a-z]*r[a-z]*f?\b.*\s(\/|~|\$HOME|\/\*)\s*$/i, why: "recursive delete of a root/home path" },
  { re: /\brm\s+-[a-z]*\br\b.*\s(\/|\/\*)(\s|$)/i, why: "recursive delete of /" },
  { re: /\bmkfs\b|\bmke2fs\b/i, why: "formatting a filesystem" },
  { re: /\bdd\b[^\n]*\bof=\/dev\/(sd|nvme|hd|disk)/i, why: "overwriting a block device" },
  { re: /\b(format)\s+[a-z]:/i, why: "formatting a Windows volume" },
  { re: /\b(del|erase)\b[^\n]*\/s[^\n]*\b[a-z]:\\?(\s|$|\*)/i, why: "mass delete of a Windows drive" },
  { re: /Remove-Item[^\n]*-Recurse[^\n]*-Force[^\n]*(\\|\/|:\\)\s*\*?\s*$/i, why: "recursive force delete of a root path" },
  { re: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:/, why: "fork bomb" },
  // Power / availability
  { re: /\b(shutdown|reboot|halt|poweroff|init\s+0|init\s+6)\b/i, why: "shutting down / rebooting a host" },
  { re: /\bStop-Computer\b|\bRestart-Computer\b/i, why: "shutting down / rebooting a host" },
  // Denial of service / flooding
  { re: /--flood\b/i, why: "flooding (denial of service)" },
  { re: /\bhping3\b[^\n]*(--flood|-i\s*u\d)/i, why: "packet flooding (denial of service)" },
  { re: /\b(t50|slowloris|slowhttptest|goldeneye|mhddos|hulk)\b/i, why: "denial-of-service tooling" },
  { re: /\b(mdk3|mdk4)\b|aireplay-ng[^\n]*--deauth/i, why: "wireless deauth / DoS" },
  { re: /\bping\b[^\n]*(-t\b|-n\s*\d{5,}|-c\s*\d{5,})/i, why: "ping flood" },
  // Anti-forensics / log tampering
  { re: /\bwevtutil\s+cl\b|Clear-EventLog|Clear-WinEvent/i, why: "clearing Windows event logs" },
  { re: /\bauditpol\b[^\n]*\/(clear|remove)/i, why: "disabling the audit policy" },
  { re: /\bshred\b|\bwipe\b/i, why: "secure wiping of evidence" },
  { re: /\b(rm|del|erase)\b[^\n]*\.(log|evtx)\b/i, why: "deleting log files" },
  { re: />\s*\/var\/log\//i, why: "truncating system logs" },
  // Mass / indiscriminate targeting: a CIDR broader than /16 (>= 131k hosts),
  // anchored to a real dotted IP so ordinary URL paths like "/3" never match.
  { re: /(?:\d{1,3}\.){3}\d{1,3}\/([0-9]|1[0-5])\b/, why: "an overly broad CIDR /0-/15 (mass targeting)" },
  // Opaque / remote code execution that hides its payload from scope+policy
  // review. These cannot be inspected, so they are refused outright.
  { re: /\b(curl|wget|iwr|invoke-webrequest)\b[\s\S]*\|\s*(bash|sh|zsh|python3?|perl|php|node|ruby)\b/i, why: "download piped straight into an interpreter (remote code execution)" },
  { re: /\b(iex|invoke-expression)\b/i, why: "Invoke-Expression of dynamic content (opaque code execution)" },
  { re: /\bdownloadstring\s*\(/i, why: "in-memory download-and-execute" },
  { re: /\b(powershell|pwsh)\b[^\n]*\s-e(nc|ncodedcommand)?\b\s+[A-Za-z0-9+/=]{16,}/i, why: "base64-encoded PowerShell command (opaque)" },
  { re: /\bbase64\b[^\n]*(-d|--decode)[\s\S]*\|\s*(bash|sh|zsh|python3?|perl|php)\b/i, why: "base64-decoded payload piped into an interpreter (opaque)" },
];

// Intrusive: exploitation, credential attacks, payload delivery, writes.
const INTRUSIVE = [
  /\bmsfconsole\b|\bmsfvenom\b|metasploit/i,
  /\bsqlmap\b[^\n]*(--dump|--os-shell|--batch)/i,
  /\b(hydra|medusa|ncrack|patator|crackmapexec|crackmap|nxc)\b/i,
  /\bjohn\b|\bhashcat\b/i,
  /\bevil-winrm\b|\bimpacket-\w+|\bpsexec\b|\bwmiexec\b|\bsmbexec\b/i,
  /\bsetoolkit\b|\bbeef\b|\bresponder\b/i,
  /nc(?:\.exe)?\s+-[a-z]*e|\b(reverse\s*shell|bind\s*shell)\b/i,
  /\bInvoke-(Expression|WebRequest).*(IEX|DownloadString)/i,
  /\bchmod\s+\+s\b|\bsetcap\b/i,
];

// Active enumeration (touches target, non-destructive).
const ACTIVE = [
  /\bnmap\b|\bmasscan\b|\brustscan\b|\bnaabu\b/i,
  /\bnikto\b|\bgobuster\b|\bffuf\b|\bdirb\b|\bdirbuster\b|\bwfuzz\b|\bferoxbuster\b/i,
  /\benum4linux\b|\bsmbclient\b|\bsmbmap\b|\brpcclient\b|\bldapsearch\b/i,
  /\bwpscan\b|\bjoomscan\b/i,
  /\bsqlmap\b/i,
  /\bnuclei\b|\bwhatweb\b|\bhttpx\b|\bsslscan\b|\bsubfinder\b/i,
];

/**
 * @param {string} command
 * @returns {{ tier: "recon"|"active"|"intrusive"|"forbidden", why?: string }}
 */
export function classify(command) {
  for (const { re, why } of FORBIDDEN) if (re.test(command)) return { tier: "forbidden", why };
  for (const re of INTRUSIVE) if (re.test(command)) return { tier: "intrusive" };
  for (const re of ACTIVE) if (re.test(command)) return { tier: "active" };
  return { tier: "recon" };
}

/**
 * Decide whether a command may execute.
 * @param {string} command
 * @param {any} agentConfig  may hold { approvedActions: string[] } approval tokens
 * @param {any} runParams    may hold { approvedActions: string[] }
 * @returns {{ decision: "allow"|"deny"|"needs_approval", tier: string, reason?: string }}
 */
export function decide(command, agentConfig, runParams) {
  const { tier, why } = classify(command);

  if (tier === "forbidden") {
    return { decision: "deny", tier, reason: `Blocked: ${why}. This class of action is never executed.` };
  }

  if (tier === "intrusive") {
    // Auto-approve is the operator's live switch (DB setting via runParams) or the
    // startup env default. It covers intrusive only — `forbidden` is denied above.
    if (runParams?.autoApproveIntrusive === true || config.worker.autoApproveIntrusive) return { decision: "allow", tier };
    const approvals = [
      ...(Array.isArray(agentConfig?.approvedActions) ? agentConfig.approvedActions : []),
      ...(Array.isArray(runParams?.approvedActions) ? runParams.approvedActions : []),
    ].map((s) => String(s).toLowerCase());
    // An operator pre-approves an intrusive step by adding a substring of the
    // command (e.g. a tool name or a ticket id) to approvedActions.
    const lc = command.toLowerCase();
    if (approvals.some((a) => a && lc.includes(a))) return { decision: "allow", tier };
    return {
      decision: "needs_approval",
      tier,
      reason: "This is an intrusive action. It requires operator approval. Plan it and report the exact " +
        "command + expected impact instead of running it, or ask the operator to add an approval token " +
        "to approvedActions.",
    };
  }

  return { decision: "allow", tier };
}
