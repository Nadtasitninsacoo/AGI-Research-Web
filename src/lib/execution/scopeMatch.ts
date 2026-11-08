// Pure authorization matcher — mirrors engine/src/scope.mjs so the UI badge and
// the real-fire gate agree with what the engine will enforce. An IP/host is
// authorized only if it matches an entry the operator explicitly added to the
// allowlist (exact IP, CIDR, bare domain + subdomains, or *.wildcard).

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

export const isIpv4 = (s: string): boolean => IPV4_RE.test(s);

const ipToInt = (ip: string): number =>
  ip.split(".").reduce((acc, oct) => (acc << 8) + (Number(oct) & 255), 0) >>> 0;

function ipInCidr(ip: string, cidr: string): boolean {
  const [net, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  if (!isIpv4(net) || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(net) & mask);
}

/** Normalize one allowlist entry: trim + lowercase. Empty → null. */
export function normalizeEntry(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return e || null;
}

/** Does `host` (an IP or hostname) fall inside the authorized allowlist? */
export function isAuthorized(host: string, allowlist: readonly string[]): boolean {
  const h = host.trim().toLowerCase();
  if (!h) return false;

  for (const raw of allowlist) {
    const entry = (raw ?? "").trim().toLowerCase();
    if (!entry) continue;

    if (entry === h) return true;
    if (entry.includes("/") && isIpv4(h) && ipInCidr(h, entry)) return true;
    if (entry.startsWith("*.")) {
      const base = entry.slice(2);
      if (h === base || h.endsWith(`.${base}`)) return true;
    } else if (!entry.includes("/") && !isIpv4(entry)) {
      if (h === entry || h.endsWith(`.${entry}`)) return true;
    }
  }
  return false;
}
