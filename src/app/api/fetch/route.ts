import { NextResponse } from "next/server";

// Operator-driven web fetch "gateway": the dashboard host (which has internet)
// fetches an external URL on the operator's behalf, so an engine box with no
// internet can still get the data. SSRF-guarded: only public external hosts are
// allowed — loopback, private, link-local and cloud-metadata targets are blocked
// so this cannot be turned against the dashboard's own internal network.

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_000_000; // 1 MB cap
const MAX_TEXT = 200_000; // chars returned to the UI

/** True only for a public, routable host — everything internal is refused. */
function isPublicHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h) return false;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".localhost") || h.endsWith(".internal") || h === "metadata.google.internal") return false;
  if (h === "::1" || h === "0.0.0.0") return false;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(h) || /^fe80:/i.test(h)) return false; // ULA / link-local IPv6
  return true;
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    ({ url: raw } = (await request.json()) as { url?: unknown });
  } catch {
    return NextResponse.json({ error: "expected JSON { url }" }, { status: 400 });
  }
  if (typeof raw !== "string" || !raw.trim()) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw.trim());
  } catch {
    return NextResponse.json({ error: "invalid URL" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "only http/https is allowed" }, { status: 400 });
  }
  if (!isPublicHost(target.hostname)) {
    return NextResponse.json({ error: "blocked: only public external hosts are allowed (internal/loopback/metadata refused)" }, { status: 403 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(target, { signal: ctrl.signal, headers: { "user-agent": "AGI-Research-Gateway/1.0" }, redirect: "follow" });
    const size = Number(res.headers.get("content-length") ?? 0);
    if (size > MAX_BYTES) {
      return NextResponse.json({ error: `response too large (${size} bytes > ${MAX_BYTES})` }, { status: 413 });
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "response too large" }, { status: 413 });
    }
    const body = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const text = body.length > MAX_TEXT ? body.slice(0, MAX_TEXT) + "\n…[truncated]" : body;
    return NextResponse.json({
      url: target.toString(),
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      bytes: buf.byteLength,
      text,
    });
  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError" ? `timed out after ${TIMEOUT_MS}ms` : err instanceof Error ? err.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
