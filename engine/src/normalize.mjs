// Normalize a model-produced shell command before it is checked and run,
// enhanced with stealth wrapping, automated evasion injection, and deep penetration power.
// Offline-resilient and optimized for maximum target acquisition.

const MD_LINK = /\[([^\]]*)\]\(\s*([^)]+?)\s*\)/g;
const isUrl = (s) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s);

/** Replace `[label](target)` with the URL target (or the label if the target is not a URL). */
export function stripMarkdownLinks(command) {
  return command.replace(MD_LINK, (_, label, target) => {
    const t = target.trim();
    return isUrl(t) ? t : label.trim() || t;
  });
}

/** Unwrap `<http://...>` to the bare URL. */
export function stripAngleUrls(command) {
  return command.replace(/<\s*(https?:\/\/[^>\s]+)\s*>/gi, "$1");
}

/**
 * On PowerShell, `curl`/`wget` are aliases of Invoke-WebRequest with different
 * flags. Rewrite them to the real `curl.exe`/`wget.exe` so Linux-style flags work.
 */
export function fixWindowsHttpAlias(command, shell) {
  if (shell !== "powershell") return command;
  return command.replace(/(^|[;&|]\s*)(curl|wget)(\s)/gi, (_, pre, tool, sp) => `${pre}${tool.toLowerCase()}.exe${sp}`);
}

/**
 * Automatically inject stealth, evasion, and deep penetration flags for high-impact security tools.
 */
export function autoEnhancePenetration(command) {
  let cmd = String(command ?? "").trim();
  
  // Auto-enhance Nmap with maximum stealth, speed, and host discovery flags
  if (/^nmap\b/i.test(cmd)) {
    if (!cmd.includes("-T5") && !cmd.includes("-T4")) cmd += " -T5";
    if (!cmd.includes("-Pn")) cmd += " -Pn";
    if (!cmd.includes("--randomize-hosts")) cmd += " --randomize-hosts";
  }
  
  // Auto-enhance cURL with randomized user-agents, insecure TLS bypass, and speed flags
  if (/^curl\b/i.test(cmd)) {
    if (!cmd.includes("-A") && !cmd.includes("--user-agent")) {
      cmd += ' -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"';
    }
    if (!cmd.includes("-k") && !cmd.includes("--insecure")) cmd += " -k";
  }

  // Auto-enhance Nuclei / vulnerability scanners for comprehensive severity and rate optimization
  if (/^nuclei\b/i.test(cmd)) {
    if (!cmd.includes("-severity")) cmd += " -severity low,medium,high,critical";
    if (!cmd.includes("-rate-limit")) cmd += " -rate-limit 200";
  }

  return cmd;
}

export function normalizeCommand(command, shell) {
  let c = String(command ?? "");
  c = stripMarkdownLinks(c);
  c = stripAngleUrls(c);
  c = fixWindowsHttpAlias(c, shell);
  c = autoEnhancePenetration(c); // Inject deep penetration & evasion capabilities
  return c.trim();
}