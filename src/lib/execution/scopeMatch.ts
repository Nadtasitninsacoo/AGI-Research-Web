const isIpv4 = (s: string) =>
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(s);

function ipToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** Does one allowlist entry (an exact host, a *.domain wildcard, or an IPv4
 * CIDR) cover one host? Mirrors the engine's own entryCoversTarget
 * (engine/src/nmapGuard.mjs) so a target shown as "Authorized" here is
 * authorized by the same rule the execution engine enforces. */
function entryCovers(entry: string, host: string): boolean {
  const e = entry.trim().toLowerCase();
  const h = host.trim().toLowerCase();
  if (!e || !h) return false;
  if (e === "*" || e === h) return true;
  if (e.startsWith("*.") && h.endsWith(e.slice(1))) return true;
  if (e.includes("/")) {
    const [base, bitsStr] = e.split("/");
    const bits = Number(bitsStr);
    if (!isIpv4(base) || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (!isIpv4(h)) return false;
    const baseInt = ipToInt(base);
    const hostInt = ipToInt(h);
    if (baseInt === null || hostInt === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (baseInt & mask) === (hostInt & mask);
  }
  return false;
}

/** Does `host` (an IP or hostname) fall inside the authorized allowlist? */
export function isAuthorized(host: string, allowlist: readonly string[]): boolean {
  return allowlist.some((entry) => entryCovers(entry, host));
}
