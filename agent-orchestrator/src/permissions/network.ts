/** Commands that fetch over the network, so a bare domain argument counts as a reach-out. */
const FETCHERS = /\b(curl|wget|http|https|xh|nc|ncat|telnet|ftp|scp|sftp|rsync)\b|\bInvoke-(WebRequest|RestMethod)\b|\biwr\b|\bwget\b/i;

/** Loopback, link-local and RFC-1918 private hosts are treated as internal, never "external". */
export function isExternalHost(host: string): boolean {
  let h = host.toLowerCase();
  const bracket = /^\[(.+?)\](?::\d+)?$/.exec(h); // [::1]:8080 -> ::1
  if (bracket) h = bracket[1];
  else if ((h.match(/:/g) ?? []).length === 1) h = h.replace(/:\d+$/, ""); // host:port / 1.2.3.4:port
  if (!h) return false;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "::1") return false;
  if (/^127\./.test(h) || h === "0.0.0.0") return false;
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  return true;
}

/** True when a shell segment fetches from a host outside this machine / private network. */
export function reachesExternalUrl(segment: string): boolean {
  for (const m of segment.matchAll(/\b[a-z][a-z0-9+.-]*:\/\/([^/\s'"]+)/gi)) {
    if (isExternalHost(m[1])) return true;
  }
  if (!FETCHERS.test(segment)) return false;
  // A fetcher with a bare domain argument (no scheme), e.g. `curl example.com/x`.
  for (const m of segment.matchAll(/(?:^|\s)(?!-)([a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?)(?:\/\S*)?/gi)) {
    const host = m[1];
    if (/\.[a-z]{2,}$/i.test(host) && isExternalHost(host)) return true;
  }
  return false;
}
