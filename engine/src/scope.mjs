// Rules of Engagement: an agent may act only on targets covered by the
// operator-approved scope. Real enforcement — no target is in scope unless
// it is explicitly listed. Local-machine targeting is always blocked,
// regardless of scope.

import { query } from "./db.mjs";
import { entryCoversTarget } from "./nmapGuard.mjs";

/** @typedef {{ targets: string[], label: string }} Scope */

/**
 * Resolve the Scope for a run. An explicit scope on the run/agent config
 * wins; otherwise this falls back to the `authorized_scope` allowlist — the
 * same table the web UI's "Authorized Scope (RoE)" panel manages
 * (src/app/execute/scope-actions.ts). If neither yields any targets, the
 * scope is empty and every remote target is rejected by checkScope below —
 * this fails closed, it never falls back to "allow everything".
 * @param {any} agentConfig
 * @param {any} runParams
 * @returns {Promise<Scope>}
 */
export async function parseScope(agentConfig, runParams) {
  const explicit =
    runParams?.scope?.targets ?? agentConfig?.scope?.targets ?? null;
  if (Array.isArray(explicit)) {
    const targets = explicit.map((t) => String(t ?? "").trim()).filter(Boolean);
    if (targets.length > 0) {
      return {
        targets,
        label: String(runParams?.scope?.label ?? agentConfig?.scope?.label ?? "Run-specific scope"),
      };
    }
  }

  try {
    const rows = await query(`SELECT entry FROM authorized_scope`);
    const targets = rows.map((r) => String(r.entry ?? "").trim()).filter(Boolean);
    if (targets.length > 0) {
      return { targets, label: "Authorized Scope allowlist (operator-approved)" };
    }
  } catch {
    // authorized_scope table missing/unavailable — fail closed below, same
    // as an empty allowlist. Never treat a DB error as "allow everything".
  }

  return { targets: [], label: "No authorized targets (allowlist empty or unavailable)" };
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

// HOST requires at least one dot (it's built for FQDNs), so a bare
// single-label name like "localhost" never matches it and was silently
// slipping past the self-protection check below — check for it directly.
// Bounded on both sides by "not a word/dot/hyphen char", so it catches
// standalone "localhost" (any case, any surrounding punctuation like
// "://" or ":3000") without misfiring on an unrelated hostname that merely
// contains the word, e.g. "localhost.example.com" or "my-localhost-app.com".
const LOCAL_WORD = /(?<![\w.-])localhost(?![\w.-])/i;

/** Pull candidate network targets out of a raw command string. */
export function extractTargets(command) {
  const found = new Set();
  if (!command) return [];
  if (LOCAL_WORD.test(command)) found.add("localhost");
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
 * Blocks local-machine targets unconditionally (self-protection), and blocks
 * any remote target that isn't covered by an entry in `scope.targets`.
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
      reason: "Self-protection shield active: Local machine targeting is prohibited.",
    };
  }

  const allowlist = Array.isArray(scope?.targets) ? scope.targets : [];
  const outOfScope = remote.filter(
    (t) => !allowlist.some((entry) => entryCoversTarget(String(entry), t)),
  );
  if (outOfScope.length > 0) {
    return {
      ok: false,
      targets,
      remote,
      outOfScope,
      reason: `Out of authorized scope: ${outOfScope.join(", ")}`,
    };
  }

  return { ok: true, targets, remote, outOfScope: [] };
}
