// Engagement scope (Rules of Engagement) enforcement.
//
// For an authorized pentest, the contract defines exactly which hosts/networks
// may be touched. This module parses that allow-list and checks whether the
// targets referenced by a command fall inside it. Anything outside scope is
// refused before it ever reaches a shell.
//
// Scope is read from the agent's `config` JSON (column `agents.config`) or the
// run's `params` JSON, under the key `scope`:
//
//   { "scope": { "targets": ["10.10.10.0/24", "app.client.example", "*.lab.local"],
//                "label": "ACME web app pentest (SOW-2026-014)" } }
//
// Local-only commands (whoami, s, local file reads, tool --help, etc.) carry
// no network target and are always allowed; scope only gates remote targets.

/** @typedef {{ targets: string[], label: string|null }} Scope */

/**
 * @param {any} agentConfig
 * @param {any} runParams
 * @returns {Scope}
 */
export function parseScope(agentConfig, runParams) {
  const raw = runParams?.scope ?? agentConfig?.scope ?? {};
  const list = Array.isArray(raw.targets) ? raw.targets : [];
  const targets = list
    .map((t) => String(t).trim().toLowerCase())
    .filter(Boolean);
  const label = typeof raw.label === "string" ? raw.label : null;
  return { targets, label };
}

const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\/\d{1,2})?\b/g;
// Hostnames / domains (at least one dot), avoiding pure version numbers.
const HOST = /\b(?=[a-z0-9.-]*[a-z])[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\b/gi;

const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

// Final-label values that mark a token as a file name / flag value, not a
// network target (e.g. rockyou.txt, scan.xml, exploit.py). Prevents wordlists
// and output files from being misread as out-of-scope hosts.
const FILE_EXT = new Set([
  "txt", "log", "xml", "json", "csv", "html", "htm", "php", "asp", "aspx", "jsp",
  "js", "ts", "py", "rb", "pl", "sh", "ps1", "bat", "cmd", "exe", "dll", "bin",
  "conf", "cfg", "ini", "yaml", "yml", "md", "pdf", "zip", "tar", "gz", "7z",
  "nse", "lst", "dic", "hash", "pcap", "cap", "db", "sql", "bak", "tmp", "out",
  "key", "pem", "crt", "cer", "pfx", "png", "jpg", "jpeg", "gif", "svg",
]);

const ipToInt = (ip) => ip.split(".").reduce((acc, oct) => (acc << 8) + (Number(oct) & 255), 0) >>> 0;

function ipInCidr(ip, cidr) {
  const [net, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(net) & mask);
}

const isIpv4 = (s) => /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(s);

/** Does a single token (ip or host) fall within the scope allow-list? */
function tokenInScope(token, scope) {
  const t = token.toLowerCase();
  if (LOCAL.has(t)) return true;

  for (const entry of scope.targets) {
    if (entry === t) return true;

    // CIDR entry vs IP token
    if (entry.includes("/") && isIpv4(t) && ipInCidr(t, entry)) return true;

    // IP entry matches itself (covered by equality above)

    // Wildcard domain: "*.lab.local" matches "a.lab.local" and "lab.local"
    if (entry.startsWith("*.")) {
      const base = entry.slice(2);
      if (t === base || t.endsWith(`.${base}`)) return true;
    }

    // Bare domain entry also matches its subdomains: "client.example"
    if (!entry.includes("/") && !isIpv4(entry)) {
      if (t === entry || t.endsWith(`.${entry}`)) return true;
    }
  }
  return false;
}

/** Pull candidate network targets out of a raw command string. */
export function extractTargets(command) {
  const found = new Set();
  for (const m of command.matchAll(IPV4)) found.add(m[0].toLowerCase());
  for (const m of command.matchAll(HOST)) {
    const h = m[0].toLowerCase();
    if (isIpv4(h.split("/")[0])) continue; // already captured as an IP
    // Skip file names / flag values: a last label that is a known file
    // extension (rockyou.txt, scan.xml) is not a host.
    const lastLabel = h.split(".").pop();
    if (FILE_EXT.has(lastLabel)) continue;
    found.add(h);
  }
  return [...found];
}

/**
 * Check a command against the engagement scope.
 * @returns {{ ok: boolean, targets: string[], outOfScope: string[], reason?: string }}
 */
export function checkScope(command, scope) {
  const targets = extractTargets(command);

  // Pure local command (no remote target referenced): allowed.
  const remote = targets.filter((t) => !LOCAL.has(t));
  if (remote.length === 0) return { ok: true, targets, remote, outOfScope: [] };

  // Remote targets exist but no scope was defined: refuse. An authorized
  // engagement always has a defined scope; a missing one is a config error,
  // not a licence to hit anything.
  if (scope.targets.length === 0) {
    return {
      ok: false,
      targets,
      remote,
      outOfScope: remote,
      reason: "No engagement scope is configured, so no remote target may be touched. " +
        "Set agents.config.scope.targets (the authorized hosts from the SOW).",
    };
  }

  const outOfScope = remote.filter((t) => !tokenInScope(t, scope));
  if (outOfScope.length) {
    return {
      ok: false,
      targets,
      remote,
      outOfScope,
      reason: `Target(s) outside the authorized scope: ${outOfScope.join(", ")}. ` +
        `Allowed: ${scope.targets.join(", ")}.`,
    };
  }
  return { ok: true, targets, remote, outOfScope: [] };
}
