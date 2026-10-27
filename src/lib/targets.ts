// Shared scope-target parsing — used by the Command action (server) and the
// live preview in CommandConsole (client). Pure, no Node deps.

/** Normalize one token: CIDR/wildcard kept; a URL or host:port reduced to host. */
export function normalizeTarget(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (!t) return "";
  if (/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(t)) return t; // CIDR
  if (t.startsWith("*.")) return t; // wildcard domain
  if (t.includes("://") || t.includes("/") || /:\d+$/.test(t)) {
    try {
      return new URL(t.includes("://") ? t : `http://${t}`).hostname;
    } catch {
      return t.replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
    }
  }
  return t;
}

/** Does a normalized token look like a real target (IP / CIDR / host / wildcard)? */
export function looksLikeTarget(t: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(t)) return t.split(/[./]/).slice(0, 4).every((o) => Number(o) <= 255); // IPv4 / CIDR
  if (/^\*\.[a-z0-9.-]+$/i.test(t)) return true; // wildcard domain
  if (/^[0-9a-f:]+$/i.test(t) && (t.match(/:/g) || []).length >= 2) return true; // IPv6-ish
  if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(t)) return true; // dotted hostname
  return false;
}

/**
 * Smart multi-target parse: split on ANY run of separators (whitespace, newline,
 * comma, semicolon, pipe), normalize each, drop prose/junk that is not a real
 * target, and de-duplicate while preserving order. No commas required.
 */
export function parseTargets(raw: string): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of raw.split(/[\s,;|]+/)) {
    const t = normalizeTarget(tok);
    if (t && looksLikeTarget(t) && !seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out;
}
