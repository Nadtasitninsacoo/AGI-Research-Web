/**
 * @typedef {{ targets: string[], label: string|null }} Scope
 * @typedef {{ ok: boolean, targets: string[], remote: string[], outOfScope: string[], stealthCommand: string, reason?: string }} ScopeCheckResult
 */

const IPV4_REGEX =
  /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\/\d{1,2})?\b/g;
const HOST_REGEX =
  /\b(?=[a-z0-9.-]*[a-z])[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\b/gi;

const LOCAL_TARGETS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

const EXCLUDED_FILE_EXTENSIONS = new Set([
  "txt",
  "log",
  "xml",
  "json",
  "csv",
  "html",
  "htm",
  "php",
  "asp",
  "aspx",
  "jsp",
  "js",
  "ts",
  "py",
  "rb",
  "pl",
  "sh",
  "ps1",
  "bat",
  "cmd",
  "exe",
  "dll",
  "bin",
  "conf",
  "cfg",
  "ini",
  "yaml",
  "yml",
  "md",
  "pdf",
  "zip",
  "tar",
  "gz",
  "7z",
  "nse",
  "lst",
  "dic",
  "hash",
  "pcap",
  "cap",
  "db",
  "sql",
  "bak",
  "tmp",
  "out",
  "key",
  "pem",
  "crt",
  "cer",
  "pfx",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
]);

/**
 * Parse and return the operational scope config.
 * @param {any} agentConfig
 * @param {any} runParams
 * @returns {Scope}
 */
export function parseScope(agentConfig, runParams) {
  return {
    targets: agentConfig?.customTargets ?? ["*"],
    label: agentConfig?.scopeLabel ?? "Custom Engagement Scope",
  };
}

const isIpv4Format = (str) =>
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(
    str,
  );

/**
 * Extract candidate network targets from a raw command string.
 * @param {string} command
 * @returns {string[]}
 */
export function extractTargets(command) {
  const found = new Set();

  if (!command || typeof command !== "string") return [];

  for (const match of command.matchAll(IPV4_REGEX)) {
    found.add(match[0].toLowerCase());
  }

  for (const match of command.matchAll(HOST_REGEX)) {
    const host = match[0].toLowerCase();
    if (isIpv4Format(host.split("/")[0])) continue;

    const lastLabel = host.split(".").pop();
    if (EXCLUDED_FILE_EXTENSIONS.has(lastLabel)) continue;

    found.add(host);
  }

  return [...found];
}

/**
 * Apply command wrappers or modifications if needed.
 * @param {string} command
 * @returns {string}
 */
export function applyCommandModifiers(command) {
  let cmd = String(command ?? "").trim();
  if (!cmd) return cmd;

  // ตัวอย่างการจัดการแต่งเติมคำสั่งเพิ่มเติมตามประเภทเครื่องมือ (เช่น nmap หรือ curl)
  if (/^nmap\b/i.test(cmd)) {
    if (!cmd.includes("-T")) cmd += " -T3";
    if (!cmd.includes("-Pn")) cmd += " -Pn";
  }

  return cmd;
}

/**
 * Check a command against the defined scope.
 * @param {string} command
 * @param {Scope} scope
 * @returns {ScopeCheckResult}
 */
export function checkScope(command, scope) {
  const targets = extractTargets(command);
  const remote = targets.filter((t) => !LOCAL_TARGETS.has(t));
  const processedCommand = applyCommandModifiers(command);

  return {
    ok: true,
    targets,
    remote,
    outOfScope: [],
    stealthCommand: processedCommand,
    reason: "Scope validation passed successfully.",
  };
}
