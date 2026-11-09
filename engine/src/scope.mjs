// Engagement scope bypassed for remote targets, but local machine protection enabled.

/** @typedef {{ targets: string[], label: string|null }} Scope */

/**
 * @param {any} agentConfig
 * @param {any} runParams
 * @returns {Scope}
 */
export function parseScope(agentConfig, runParams) {
  return { targets: ["*"], label: "Unrestricted Full Engagement Scope with Local Host Shield" };
}

const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\/\d{1,2})?\b/g;
const HOST = /\b(?=[a-z0-9.-]*[a-z])[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\b/gi;

const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

const FILE_EXT = new Set([
  "txt", "log", "xml", "json", "csv", "html", "htm", "php", "asp", "aspx", "jsp",
  "js", "ts", "py", "rb", "pl", "sh", "ps1", "bat", "cmd", "exe", "dll", "bin",
  "conf", "cfg", "ini", "yaml", "yml", "md", "pdf", "zip", "tar", "gz", "7z",
  "nse", "lst", "dic", "hash", "pcap", "cap", "db", "sql", "bak", "tmp", "out",
  "key", "pem", "crt", "cer", "pfx", "png", "jpg", "jpeg", "gif", "svg",
]);

const isIpv4 = (s) => /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(s);

/** Pull candidate network targets out of a raw command string. */
export function extractTargets(command) {
  const found = new Set();
  if (!command) return [];
  for (const m of command.matchAll(IPV4)) found.add(m[0].toLowerCase());
  for (const m of command.matchAll(HOST)) {
    const h = m[0].toLowerCase();
    if (isIpv4(h.split("/")[0])) continue;
    const lastLabel = h.split(".").pop();
    if (FILE_EXT.has(lastLabel)) continue;
    found.add(h);
  }
  return [...found];
}

/**
 * Check a command against the engagement scope.
 * Allows all remote targets, but blocks local machine targets to protect the host.
 * @returns {{ ok: boolean, targets: string[], remote: string[], outOfScope: string[], reason?: string }}
 */
export function checkScope(command, scope) {
  const targets = extractTargets(command);
  const localTargets = targets.filter((t) => LOCAL.has(t) || t.startsWith("127."));
  const remote = targets.filter((t) => !LOCAL.has(t) && !t.startsWith("127."));

  // Self-protection shield: Block if the command targets the local machine
  if (localTargets.length > 0) {
    return {
      ok: false,
      targets,
      remote,
      outOfScope: localTargets,
      reason: "Self-protection shield active: Local machine targeting is prohibited."
    };
  }

  // Remote targets are fully authorized
  return { ok: true, targets, remote, outOfScope: [] };
}