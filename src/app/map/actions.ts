"use server";

import { lookup } from "node:dns/promises";
import net from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { geocoder, carrier } from "libphonenumber-geo-carrier";

export type PhoneArea =
  | { ok: false }
  | { ok: true; country: string; countryName: string; regionName: string; carrier: string; place: string };

/**
 * Resolve the GEOGRAPHIC AREA of a phone number's numbering plan: the country,
 * and for geographic (landline) numbers the area-code region, plus the carrier
 * for mobiles. This is where the number is REGISTERED, not the real-time
 * location of its holder — that cannot be derived from a number at all.
 *
 * Runs on the server because `libphonenumber-geo-carrier` reads its metadata
 * from disk via `fs`, which is unavailable in the browser bundle.
 */
export async function phoneAreaAction(input: string): Promise<PhoneArea> {
  try {
    const p = parsePhoneNumberFromString(input, "TH");
    if (!p || !p.country) return { ok: false };
    const region = (await geocoder(p, "en")) || "";
    const car = (await carrier(p, "en")) || "";
    const regionName = region.split("/")[0].trim(); // "Chiang Mai/Chiang Rai" -> "Chiang Mai"
    const countryName = new Intl.DisplayNames(["en"], { type: "region" }).of(p.country) ?? p.country;
    return {
      ok: true,
      country: p.country,
      countryName,
      regionName,
      carrier: car,
      place: regionName ? `${regionName}, ${countryName}` : countryName,
    };
  } catch {
    return { ok: false };
  }
}

export type GeoIP =
  | { ok: false; message: string }
  | {
      ok: true;
      ip: string;
      host?: string;
      lat: number;
      lon: number;
      city: string;
      region: string;
      country: string;
      countryCode: string;
      isp: string;
      org: string;
    };

/** Private / loopback / link-local / reserved — no public geolocation exists. */
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l === "::1" || l === "::" || l.startsWith("fe80") || l.startsWith("fc") || l.startsWith("fd");
  }
  return false;
}

/**
 * Geolocate a PUBLIC IP or hostname to its approximate position (the inverse of
 * "what IP is at this spot?", which does not exist — a place has no IP). A
 * hostname is resolved to its IP via DNS first. Returns city/country + ISP so an
 * operator can pin where a host sits. Read-only OSINT: this performs NO scan or
 * connection to the target, only a DNS lookup + a geo-IP database query.
 *
 * Runs on the server for DNS access and to keep the external call controlled.
 */
export async function geoipAction(input: string): Promise<GeoIP> {
  const q = (input || "").trim();
  if (!q) return { ok: false, message: "ใส่ IP หรือ host ก่อน" };
  try {
    let ip = q;
    let host: string | undefined;
    if (!net.isIP(q)) {
      const h = q.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
      if (!/^[a-z0-9.-]+\.[a-z0-9.-]+$/i.test(h)) return { ok: false, message: "รูปแบบ IP/host ไม่ถูกต้อง" };
      host = h;
      ip = (await lookup(h)).address;
    }
    if (isPrivateIp(ip)) return { ok: false, message: `${ip} เป็น IP ภายใน/loopback — ไม่มีตำแหน่งสาธารณะให้ระบุ` };
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, message: "บริการ geo-IP ไม่ตอบ" };
    const d = (await res.json()) as {
      success?: boolean; message?: string; latitude?: number; longitude?: number;
      city?: string; region?: string; country?: string; country_code?: string;
      connection?: { isp?: string; org?: string };
    };
    if (!d || d.success === false || typeof d.latitude !== "number" || typeof d.longitude !== "number") {
      return { ok: false, message: d?.message || "ระบุตำแหน่งไม่ได้" };
    }
    return {
      ok: true,
      ip,
      host,
      lat: d.latitude,
      lon: d.longitude,
      city: d.city || "",
      region: d.region || "",
      country: d.country || "",
      countryCode: d.country_code || "",
      isp: d.connection?.isp || d.connection?.org || "",
      org: d.connection?.org || "",
    };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    return { ok: false, message: code === "ENOTFOUND" ? "resolve host ไม่สำเร็จ" : "ค้นหาตำแหน่งล้มเหลว" };
  }
}

const execFileP = promisify(execFile);

export type PortRow = { port: number; proto: string; state: string; service: string; version: string };
export type PortScan =
  | { ok: false; message: string }
  | {
      ok: true;
      target: string; // exactly what we handed nmap
      up: boolean; // did the host answer?
      open: PortRow[];
      scanned: string; // human description of what was scanned (e.g. "top 100 TCP")
      seconds: number;
    };

/** A single scannable target: one bare IPv4/IPv6, or one hostname. No CIDR, no
 *  lists, no ports, no scheme — this is a single-host recon tool, not a sweeper. */
function cleanTarget(raw: string): { ok: true; target: string } | { ok: false; message: string } {
  const q = (raw || "").trim();
  if (!q) return { ok: false, message: "ใส่ IP หรือ host ก่อน" };
  if (net.isIP(q)) return { ok: true, target: q };
  // Strip scheme / path / :port that a user may paste, then validate as a hostname.
  const h = q.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  if (h.length > 253 || !/^[a-z0-9]([a-z0-9-]{0,62}\.)+[a-z0-9]([a-z0-9-]{0,62})$/i.test(h)) {
    return { ok: false, message: "รูปแบบ IP/host ไม่ถูกต้อง (สแกนได้ทีละเป้าหมายเดียว ไม่รับช่วง CIDR/หลายค่า)" };
  }
  return { ok: true, target: h };
}

/** Validate an operator-supplied nmap port spec: "80", "80,443", "1-1000",
 *  "22,80,8000-8100". Digits/commas/hyphens only, each port 1-65535, lo<=hi,
 *  a bounded number of groups. Returns a normalized spec or an error. */
function cleanPorts(spec?: string): { ok: true; ports?: string } | { ok: false; message: string } {
  const s = (spec || "").trim();
  if (!s) return { ok: true, ports: undefined };
  if (!/^\d{1,5}(?:-\d{1,5})?(?:,\d{1,5}(?:-\d{1,5})?)*$/.test(s)) {
    return { ok: false, message: "รูปแบบพอร์ตไม่ถูกต้อง — ใช้ได้เช่น 80,443 หรือ 1-1000" };
  }
  const groups = s.split(",");
  if (groups.length > 64) return { ok: false, message: "ระบุพอร์ตมากกลุ่มเกินไป (จำกัด 64 กลุ่ม)" };
  for (const g of groups) {
    const [lo, hi] = g.split("-").map(Number);
    if (lo < 1 || lo > 65535) return { ok: false, message: `พอร์ต ${lo} อยู่นอกช่วง 1-65535` };
    if (hi !== undefined && (hi < 1 || hi > 65535 || hi < lo)) return { ok: false, message: `ช่วงพอร์ต ${g} ไม่ถูกต้อง` };
  }
  return { ok: true, ports: s };
}

/** nmap grepable "Ports:" field → rows. Each port is a/b/c/d/e/f/g split by "/". */
function parseGrepable(out: string): { up: boolean; open: PortRow[] } {
  let up = false;
  const open: PortRow[] = [];
  for (const line of out.split(/\r?\n/)) {
    const h = line.match(/^Host:\s+\S+.*?\bStatus:\s+(\w+)/);
    if (h) up ||= h[1].toLowerCase() === "up";
    const p = line.match(/\bPorts:\s+(.+?)(?:\tIgnored State:|$)/);
    if (!p) continue;
    up = true; // a Ports: line only exists for a responsive host
    for (const spec of p[1].split(", ")) {
      const f = spec.split("/");
      const port = Number(f[0]);
      const state = (f[1] || "").trim();
      if (!Number.isFinite(port) || state !== "open") continue;
      open.push({
        port,
        proto: (f[2] || "tcp").trim(),
        state,
        service: (f[4] || "").trim(),
        version: (f[6] || "").trim().replace(/\|$/, ""),
      });
    }
  }
  open.sort((a, b) => a.port - b.port);
  return { up, open };
}

/**
 * ACTIVE RECON: run an unprivileged nmap TCP-connect + light service scan against
 * ONE operator-supplied host and return the open ports. Unlike geoipAction this
 * DOES touch the target (it opens TCP connections to it) — it is for an authorized
 * engagement only. Guardrails: single host (no CIDR/lists), a bounded top-ports
 * set, no privileged/raw-packet modes (-sT needs no admin), capped timing so it
 * can't be turned into a flooder, and a hard wall-clock timeout. Arguments are
 * passed to execFile as an array (never a shell string), so the target can't inject.
 */
export async function portScanAction(
  input: string,
  opts?: { allPorts?: boolean; ports?: string },
): Promise<PortScan> {
  const c = cleanTarget(input);
  if (!c.ok) return c;
  const cp = cleanPorts(opts?.ports);
  if (!cp.ok) return cp;
  // Explicit ports win; otherwise the top-N set. An explicit range can be large,
  // but the --host-timeout still bounds total scan time so it can't become a flood.
  const portArgs = cp.ports
    ? ["-p", cp.ports]
    : ["--top-ports", opts?.allPorts ? "1000" : "100"];
  const scanned = cp.ports
    ? `พอร์ต ${cp.ports}`
    : opts?.allPorts ? "top 1000 TCP" : "top 100 TCP";
  const args = [
    "-sT",                    // TCP connect scan — no raw sockets, no admin needed
    "-Pn",                    // treat host as up (many hosts drop ping); we report "up" from port replies
    "-sV", "--version-light", // identify services, but the fast probe set only
    ...portArgs,
    "-T4",                    // brisk but not the flood-prone -T5
    "--host-timeout", "90s",
    "-n",                     // we resolve/validate ourselves; let nmap skip rDNS
    "-oG", "-",               // grepable report to stdout
    c.target,
  ];
  const started = Date.now();
  const bins = [process.env.NMAP_PATH, "nmap", "C:/Program Files (x86)/Nmap/nmap.exe"].filter(Boolean) as string[];
  let lastErr: unknown;
  for (const bin of bins) {
    try {
      const { stdout } = await execFileP(bin, args, { timeout: 120_000, maxBuffer: 4 << 20, windowsHide: true });
      const { up, open } = parseGrepable(stdout);
      return { ok: true, target: c.target, up, open, scanned, seconds: Math.round((Date.now() - started) / 1000) };
    } catch (err) {
      const code = (err as { code?: string | number })?.code;
      if (code === "ENOENT") { lastErr = err; continue; } // try the next candidate path
      if ((err as { killed?: boolean })?.killed) return { ok: false, message: "สแกนนานเกินกำหนด (timeout) — เป้าหมายอาจกรองแพ็กเก็ตอยู่" };
      // nmap can exit non-zero yet still print a usable grepable report (e.g. host-timeout).
      const stdout = (err as { stdout?: string })?.stdout;
      if (typeof stdout === "string" && /\bHost:/.test(stdout)) {
        const { up, open } = parseGrepable(stdout);
        return { ok: true, target: c.target, up, open, scanned, seconds: Math.round((Date.now() - started) / 1000) };
      }
      lastErr = err;
    }
  }
  const code = (lastErr as { code?: string | number })?.code;
  if (code === "ENOENT") return { ok: false, message: "ไม่พบ nmap บนเครื่องนี้ — ติดตั้ง Nmap หรือกำหนด NMAP_PATH" };
  return { ok: false, message: "สแกนล้มเหลว" };
}

export type ShodanHost = {
  ip: string;
  ports: number[];
  org: string;
  isp: string;
  product: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  hostnames: string[];
};
export type ShodanResult =
  | { ok: false; message: string }
  | {
      ok: true;
      place: string;
      query: string;
      center?: { lat: number; lon: number };
      total: number;
      shown: number;
      hosts: ShodanHost[];
    };

type ShodanMatch = {
  ip_str?: string;
  port?: number;
  org?: string;
  isp?: string;
  product?: string;
  hostnames?: string[];
  location?: { latitude?: number; longitude?: number; city?: string; country_code?: string };
};

/**
 * OSINT host discovery by AREA via Shodan's PRE-INDEXED database. This performs
 * NO active scan — it only reads records Shodan already collected and plots the
 * hosts it has geolocated to the given place. A place name is geocoded (English,
 * via Nominatim) into a `city:"…" country:"…"` Shodan query; a raw Shodan filter
 * (city:/country:/org:/net:/port:…) is passed through untouched. Read-only, fixed
 * upstreams (no SSRF surface), and gated on an operator-supplied API key.
 */
/** Run a Shodan host-search query and collapse matches into one record per IP. */
async function runShodanQuery(
  key: string,
  query: string,
  place: string,
  center: { lat: number; lon: number } | undefined,
): Promise<ShodanResult> {
  const url =
    "https://api.shodan.io/shodan/host/search?key=" + encodeURIComponent(key) +
    "&query=" + encodeURIComponent(query);
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (res.status === 401) return { ok: false, message: "Shodan API key ไม่ถูกต้อง" };
  if (res.status === 403) return { ok: false, message: "แผน Shodan นี้ค้นหาไม่ได้ (ต้องมีสิทธิ์ search)" };
  if (res.status === 429) return { ok: false, message: "Shodan จำกัดอัตราการเรียก (rate limit) ลองใหม่อีกครั้ง" };
  if (!res.ok) return { ok: false, message: `Shodan ตอบกลับผิดพลาด (${res.status})` };
  const data = (await res.json()) as { total?: number; matches?: ShodanMatch[] };
  const matches = Array.isArray(data.matches) ? data.matches : [];
  const byIp = new Map<string, ShodanHost>();
  for (const m of matches) {
    const ip = m.ip_str;
    if (!ip) continue;
    const loc = m.location ?? {};
    let h = byIp.get(ip);
    if (!h) {
      h = {
        ip,
        ports: [],
        org: m.org || "",
        isp: m.isp || "",
        product: m.product || "",
        city: loc.city || "",
        country: loc.country_code || "",
        lat: Number(loc.latitude),
        lon: Number(loc.longitude),
        hostnames: Array.isArray(m.hostnames) ? m.hostnames : [],
      };
      byIp.set(ip, h);
    }
    if (typeof m.port === "number" && !h.ports.includes(m.port)) h.ports.push(m.port);
    if (!h.product && m.product) h.product = m.product;
  }
  const hosts = [...byIp.values()].slice(0, 300);
  for (const h of hosts) h.ports.sort((x, y) => x - y);
  return { ok: true, place, query, center, total: Number(data.total ?? matches.length), shown: hosts.length, hosts };
}

/** Build a Shodan `city:/country:` query from Nominatim address parts. */
function shodanQueryFromAddress(a: {
  city?: string; town?: string; village?: string; state?: string; county?: string; country_code?: string;
}): { query: string; label: string } | null {
  const city = a.city || a.town || a.village || a.county || a.state || "";
  const cc = (a.country_code || "").toUpperCase();
  const parts: string[] = [];
  if (city) parts.push(`city:"${city}"`);
  if (cc) parts.push(`country:"${cc}"`);
  if (!parts.length) return null;
  return { query: parts.join(" "), label: [city, cc].filter(Boolean).join(", ") };
}

export async function shodanSearchAction(placeInput: string): Promise<ShodanResult> {
  const key = process.env.SHODAN_API_KEY?.trim();
  if (!key) return { ok: false, message: "ยังไม่ได้ตั้ง SHODAN_API_KEY ใน .env.local" };
  const place = (placeInput || "").trim();
  if (!place) return { ok: false, message: 'บอกเมือง/พื้นที่ด้วย เช่น "shodan มอสโก"' };
  try {
    if (/\b(city|country|org|net|port|product|geo|asn|hostname):/i.test(place)) {
      return await runShodanQuery(key, place, place, undefined); // raw Shodan filter
    }
    const geoUrl =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&addressdetails=1&q=" +
      encodeURIComponent(place);
    const geoRes = await fetch(geoUrl, {
      headers: { "User-Agent": "AGI-Research-Map/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    const arr = (geoRes.ok ? await geoRes.json() : []) as Array<{
      lat?: string; lon?: string;
      address?: Parameters<typeof shodanQueryFromAddress>[0];
    }>;
    const g = Array.isArray(arr) ? arr[0] : undefined;
    if (!g) return { ok: false, message: `หาพื้นที่ "${place}" ไม่เจอ` };
    const built = shodanQueryFromAddress(g.address ?? {});
    if (!built) return { ok: false, message: "สร้างคำค้น Shodan จากพื้นที่นี้ไม่ได้" };
    return await runShodanQuery(key, built.query, built.label || place, { lat: Number(g.lat), lon: Number(g.lon) });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    return { ok: false, message: name === "TimeoutError" ? "Shodan ตอบช้าเกินกำหนด (timeout)" : "ค้น Shodan ล้มเหลว" };
  }
}

/**
 * Same OSINT Shodan lookup, but for the CURRENT MAP AREA: a lat/lon (the map
 * centre) is reverse-geocoded to its city, then searched. Read-only, no scan.
 */
export async function shodanByCoordsAction(lat: number, lon: number): Promise<ShodanResult> {
  const key = process.env.SHODAN_API_KEY?.trim();
  if (!key) return { ok: false, message: "ยังไม่ได้ตั้ง SHODAN_API_KEY ใน .env.local" };
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, message: "พิกัดไม่ถูกต้อง" };
  try {
    const revUrl =
      "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=" +
      encodeURIComponent(String(lat)) + "&lon=" + encodeURIComponent(String(lon));
    const revRes = await fetch(revUrl, {
      headers: { "User-Agent": "AGI-Research-Map/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    const d = (revRes.ok ? await revRes.json() : null) as {
      address?: Parameters<typeof shodanQueryFromAddress>[0];
    } | null;
    const built = d?.address ? shodanQueryFromAddress(d.address) : null;
    if (!built) return { ok: false, message: "พื้นที่นี้ระบุเมืองไม่ได้ — เลื่อนไปใกล้เมืองแล้วลองใหม่" };
    return await runShodanQuery(key, built.query, built.label, { lat, lon });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    return { ok: false, message: name === "TimeoutError" ? "Shodan ตอบช้าเกินกำหนด (timeout)" : "ค้น Shodan ล้มเหลว" };
  }
}

export type InternetDb =
  | { ok: false; message: string }
  | {
      ok: true;
      ip: string;
      host?: string;
      ports: number[];
      hostnames: string[];
      cpes: string[];
      tags: string[];
      vulns: string[];
    };

/**
 * KEYLESS OSINT exposure lookup via Shodan's free InternetDB
 * (https://internetdb.shodan.io/{ip}) — no API key. Returns the open ports,
 * hostnames, software CPEs, tags and known CVEs that Shodan has already indexed
 * for a public IP. Read-only: this does NOT scan the target, it reads an index.
 * A hostname is resolved to its IP first; private/loopback IPs are rejected.
 */
export async function internetdbAction(input: string): Promise<InternetDb> {
  const q = (input || "").trim();
  if (!q) return { ok: false, message: "ใส่ IP หรือ host ก่อน" };
  try {
    let ip = q;
    let host: string | undefined;
    if (!net.isIP(q)) {
      const h = q.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
      if (!/^[a-z0-9.-]+\.[a-z0-9.-]+$/i.test(h)) return { ok: false, message: "รูปแบบ IP/host ไม่ถูกต้อง" };
      host = h;
      ip = (await lookup(h)).address;
    }
    if (isPrivateIp(ip)) return { ok: false, message: `${ip} เป็น IP ภายใน — InternetDB ไม่มีข้อมูล` };
    const res = await fetch(`https://internetdb.shodan.io/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(8000),
    });
    // 404 = Shodan has no record for this IP (not an error — just nothing indexed).
    if (res.status === 404) return { ok: true, ip, host, ports: [], hostnames: [], cpes: [], tags: [], vulns: [] };
    if (!res.ok) return { ok: false, message: `InternetDB ตอบผิดพลาด (${res.status})` };
    const d = (await res.json()) as {
      ports?: number[]; hostnames?: string[]; cpes?: string[]; tags?: string[]; vulns?: string[];
    };
    return {
      ok: true,
      ip,
      host,
      ports: Array.isArray(d.ports) ? [...d.ports].sort((a, b) => a - b) : [],
      hostnames: Array.isArray(d.hostnames) ? d.hostnames : [],
      cpes: Array.isArray(d.cpes) ? d.cpes : [],
      tags: Array.isArray(d.tags) ? d.tags : [],
      vulns: Array.isArray(d.vulns) ? d.vulns : [],
    };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    return { ok: false, message: code === "ENOTFOUND" ? "resolve host ไม่สำเร็จ" : "ค้น InternetDB ล้มเหลว" };
  }
}
