// Client-side safety net for the two DARK AGI nmap operations we expose to the
// AI agent (os-fingerprint, script-scan). DARK AGI's own backend is the real
// authority — its own Zod schemas, scope check and approval gate all still
// apply server-side, unchanged. This module exists only to stop the AGENT
// (never a human typing directly into the DARK AGI Terminal) from asking for
// something dangerous in the first place, and to give it a clear, actionable
// rejection instead of a raw 422 from the other platform.
//
// Pure functions, no I/O — fully unit-testable without a running DARK AGI.

// NSE script/category names this engine lets the AGENT request automatically.
// Anything outside this list (a path, a .lua file, or a louder category like
// intrusive/brute/dos/exploit) is rejected here — a human operator who really
// wants one of those can still type it directly in the DARK AGI Terminal,
// where it's their own explicit, approved action, not something an agent
// reached for on its own.
export const ALLOWED_NSE_NAMES = new Set([
  "default",
  "safe",
  "discovery",
  "version",
  "auth",
  "banner",
  "http-title",
  "http-headers",
  "ssl-cert",
  "ssh-hostkey",
  "dns-brute", // explicitly allow-listed by name (not the generic "brute" category)
]);

// Louder NSE categories that must never be reachable through the agent path.
const BLOCKED_CATEGORIES = new Set(["intrusive", "brute", "dos", "exploit", "fuzzer", "vuln"]);

// A bare script/category name: letters, digits, '-' and '_' only. No '/',
// no '.', no whitespace — rules out a filesystem path or a ".lua" filename.
const SAFE_NAME = /^[a-z0-9_-]+$/i;

/**
 * @param {unknown} scripts
 * @returns {{ ok: true, scripts: string[] } | { ok: false, reason: string, rejected: string[] }}
 */
export function validateNseScripts(scripts) {
  if (!Array.isArray(scripts) || scripts.length === 0) {
    return { ok: false, reason: "ต้องระบุ scripts อย่างน้อย 1 รายการ", rejected: [] };
  }
  const rejected = [];
  const clean = [];
  for (const raw of scripts) {
    const name = String(raw ?? "").trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    if (!SAFE_NAME.test(name) || name.includes("..") || name.includes("/") || name.includes("\\")) {
      rejected.push(name);
      continue;
    }
    if (lower.endsWith(".lua")) {
      rejected.push(name);
      continue;
    }
    if (BLOCKED_CATEGORIES.has(lower)) {
      rejected.push(name);
      continue;
    }
    if (!ALLOWED_NSE_NAMES.has(lower)) {
      rejected.push(name);
      continue;
    }
    clean.push(lower);
  }
  if (rejected.length > 0) {
    return {
      ok: false,
      reason:
        `ปฏิเสธ script/category ที่ไม่อยู่ใน allow-list หรือไม่ปลอดภัย: ${rejected.join(", ")}. ` +
        `อนุญาตเฉพาะ: ${[...ALLOWED_NSE_NAMES].join(", ")} (ห้าม path, ไฟล์ .lua, หรือหมวด intrusive/brute/dos/exploit/fuzzer/vuln ผ่านเอเจนต์)`,
      rejected,
    };
  }
  if (clean.length === 0) {
    return { ok: false, reason: "ไม่มี script ที่ใช้ได้หลังกรอง", rejected: [] };
  }
  return { ok: true, scripts: [...new Set(clean)] };
}

/**
 * Clamp a requested --max-rate to this deployment's configured ceiling.
 * @param {unknown} value
 * @param {number} cap
 * @param {number} fallback
 */
export function clampMaxRate(value, cap, fallback = 500) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Math.min(fallback, cap);
  return Math.max(1, Math.min(Math.round(n), cap));
}

/**
 * @param {unknown} targets
 * @returns {{ ok: true, targets: string[] } | { ok: false, reason: string }}
 */
export function validateTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return { ok: false, reason: "ต้องระบุ targets อย่างน้อย 1 รายการ" };
  }
  const clean = targets.map((t) => String(t ?? "").trim()).filter(Boolean);
  if (clean.length === 0) {
    return { ok: false, reason: "targets ว่างเปล่าหลังตัดช่องว่าง" };
  }
  return { ok: true, targets: [...new Set(clean)] };
}

const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const isIpv4 = (s) => /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(s);

function ipToInt(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** Does one scope entry (an exact host, a *.domain wildcard, or an IPv4 CIDR)
 * cover one requested target? Best-effort — DARK AGI's own server-side scope
 * check is the real authority; this only lets us warn the agent BEFORE
 * spending a job submission on something that's going to be rejected anyway. */
function entryCoversTarget(entry, target) {
  const e = entry.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  if (e === "*" || e === t) return true;
  if (e.startsWith("*.") && t.endsWith(e.slice(1))) return true;
  if (e.includes("/")) {
    const [base, bitsStr] = e.split("/");
    const bits = Number(bitsStr);
    if (!isIpv4(base) || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    const targetIp = isIpv4(t) ? t : null;
    if (!targetIp) return false;
    const baseInt = ipToInt(base);
    const targetInt = ipToInt(targetIp);
    if (baseInt === null || targetInt === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (baseInt & mask) === (targetInt & mask);
  }
  return false;
}

/**
 * @param {string[]} targets
 * @param {{ targets: string[] }[]} scopes active DARK AGI scopes (already
 *   filtered to enabled ones by the caller)
 * @returns {{ ok: true } | { ok: false, uncovered: string[] }}
 */
export function targetsWithinScopes(targets, scopes) {
  const allEntries = scopes.flatMap((s) => (Array.isArray(s.targets) ? s.targets : []));
  const uncovered = targets.filter((t) => !allEntries.some((e) => entryCoversTarget(String(e), t)));
  return uncovered.length === 0 ? { ok: true } : { ok: false, uncovered };
}
