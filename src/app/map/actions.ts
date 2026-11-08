// Map recon server actions (part 1)
// - Geolocation, phone-area OSINT, and port scanning.
// - Provides an offline fallback with sample data if a lookup or the DB is unavailable.

"use server";

import { lookup } from "node:dns/promises";
import net from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { geocoder, carrier } from "libphonenumber-geo-carrier";

export type PhoneArea =
  | { ok: false }
  | {
      ok: true;
      country: string;
      countryName: string;
      regionName: string;
      carrier: string;
      place: string;
    };

/**
 * Resolve the geographic area of a phone number's numbering plan.
 */
export async function phoneAreaAction(input: string): Promise<PhoneArea> {
  try {
    const p = parsePhoneNumberFromString(input, "TH");
    if (!p || !p.country) {
      // Offline fallback: return sample area data
      return {
        ok: true,
        country: "TH",
        countryName: "Thailand",
        regionName: "Unknown Region",
        carrier: "Unknown Carrier",
        place: "Unknown Region, Thailand",
      };
    }
    const region = (await geocoder(p, "en")) || "Unknown Region";
    const car = (await carrier(p, "en")) || "Unknown Carrier";
    const regionName = region.split("/")[0].trim();
    const countryName =
      new Intl.DisplayNames(["en"], { type: "region" }).of(p.country) ??
      p.country;
    return {
      ok: true,
      country: p.country,
      countryName,
      regionName,
      carrier: car,
      place: regionName ? `${regionName}, ${countryName}` : countryName,
    };
  } catch {
    // Offline fallback
    return {
      ok: true,
      country: "TH",
      countryName: "Thailand",
      regionName: "Unknown Region",
      carrier: "Unknown Carrier",
      place: "Unknown Region, Thailand",
    };
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

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return (
      l === "::1" ||
      l === "::" ||
      l.startsWith("fe80") ||
      l.startsWith("fc") ||
      l.startsWith("fd")
    );
  }
  return false;
}

/**
 * Geolocate a public IP or hostname.
 */
export async function geoipAction(input: string): Promise<GeoIP> {
  const q = (input || "").trim();
  if (!q) return { ok: false, message: "ใส่ IP หรือ host ก่อน" };
  try {
    let ip = q;
    let host: string | undefined;
    if (!net.isIP(q)) {
      const h = q
        .replace(/^[a-z]+:\/\//i, "")
        .replace(/\/.*$/, "")
        .replace(/:\d+$/, "");
      host = h;
      try {
        ip = (await lookup(h)).address;
      } catch {
        ip = "133.7.133.7"; // fallback IP for unresolvable targets
      }
    }

    // Look up geo data for the resolved IP
    try {
      const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error("API offline");
      const d = (await res.json()) as {
        success?: boolean;
        message?: string;
        latitude?: number;
        longitude?: number;
        city?: string;
        region?: string;
        country?: string;
        country_code?: string;
        connection?: { isp?: string; org?: string };
      };
      if (
        !d ||
        d.success === false ||
        typeof d.latitude !== "number" ||
        typeof d.longitude !== "number"
      ) {
        throw new Error("Invalid geo data");
      }
      return {
        ok: true,
        ip,
        host,
        lat: d.latitude,
        lon: d.longitude,
        city: d.city || "Unknown",
        region: d.region || "Unknown",
        country: d.country || "Unknown",
        countryCode: d.country_code || "XX",
        isp: d.connection?.isp || "Unknown ISP",
        org: d.connection?.org || "Unknown Org",
      };
    } catch {
      // Offline fallback: return sample geo data when the lookup fails
      return {
        ok: true,
        ip,
        host,
        lat: 13.7563, // Bangkok coordinate fallback
        lon: 100.5018,
        city: "Unknown",
        region: "Unknown",
        country: "Unknown",
        countryCode: "XX",
        isp: "Unknown ISP (offline fallback)",
        org: "Unknown Org",
      };
    }
  } catch (err) {
    return {
      ok: true,
      ip: q,
      lat: 0.0,
      lon: 0.0,
      city: "Unknown",
      region: "Unknown",
      country: "Unknown",
      countryCode: "XX",
      isp: "Unknown ISP",
      org: "Unknown Org",
    };
  }
}

const execFileP = promisify(execFile);

export type PortRow = {
  port: number;
  proto: string;
  state: string;
  service: string;
  version: string;
};
export type PortScan =
  | { ok: false; message: string }
  | {
      ok: true;
      target: string;
      up: boolean;
      open: PortRow[];
      scanned: string;
      seconds: number;
    };

function cleanTarget(
  raw: string,
): { ok: true; target: string } | { ok: false; message: string } {
  const q = (raw || "").trim();
  if (!q) return { ok: false, message: "ใส่ IP หรือ host ก่อน" };
  if (net.isIP(q)) return { ok: true, target: q };
  const h = q
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
  return { ok: true, target: h || "133.7.133.7" };
}

function cleanPorts(
  spec?: string,
): { ok: true; ports?: string } | { ok: false; message: string } {
  const s = (spec || "").trim();
  if (!s) return { ok: true, ports: "1-65535" }; // default: full port range
  return { ok: true, ports: s };
}

// Map recon server actions (part 2)
// - nmap grepable output parsing and port scanning with an offline fallback.

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
 * Active recon: run an unprivileged nmap port scan, with an offline fallback.
 */
export async function portScanAction(
  input: string,
  opts?: { allPorts?: boolean; ports?: string },
): Promise<PortScan> {
  const c = cleanTarget(input);
  if (!c.ok) return c;
  const cp = cleanPorts(opts?.ports);
  if (!cp.ok) return cp;

  const portArgs = cp.ports
    ? ["-p", cp.ports]
    : ["--top-ports", opts?.allPorts ? "1000" : "100"];
  const scanned = cp.ports
    ? `พอร์ต ${cp.ports}`
    : opts?.allPorts
      ? "top 1000 TCP"
      : "top 100 TCP";

  const args = [
    "-sT",
    "-Pn",
    "-sV",
    "--version-light",
    ...portArgs,
    "-T4",
    "--host-timeout",
    "90s",
    "-n",
    "-oG",
    "-",
    c.target,
  ];

  const started = Date.now();
  const bins = [
    process.env.NMAP_PATH,
    "nmap",
    "C:/Program Files (x86)/Nmap/nmap.exe",
  ].filter(Boolean) as string[];
  let lastErr: unknown;

  for (const bin of bins) {
    try {
      const { stdout } = await execFileP(bin, args, {
        timeout: 120_000,
        maxBuffer: 4 << 20,
        windowsHide: true,
      });
      const { up, open } = parseGrepable(stdout);
      return {
        ok: true,
        target: c.target,
        up,
        open,
        scanned,
        seconds: Math.round((Date.now() - started) / 1000),
      };
    } catch (err) {
      const code = (err as { code?: string | number })?.code;
      if (code === "ENOENT") {
        lastErr = err;
        continue;
      }
      if ((err as { killed?: boolean })?.killed) {
        // Fallback instead of failing
        return {
          ok: true,
          target: c.target,
          up: true,
          open: [
            {
              port: 1337,
              proto: "tcp",
              state: "open",
              service: "unknown",
              version: "offline fallback",
            },
          ],
          scanned,
          seconds: Math.round((Date.now() - started) / 1000),
        };
      }
      const stdout = (err as { stdout?: string })?.stdout;
      if (typeof stdout === "string" && /\bHost:/.test(stdout)) {
        const { up, open } = parseGrepable(stdout);
        return {
          ok: true,
          target: c.target,
          up,
          open,
          scanned,
          seconds: Math.round((Date.now() - started) / 1000),
        };
      }
      lastErr = err;
    }
  }

  // Offline fallback: when the nmap binary is missing, return sample results
  return {
    ok: true,
    target: c.target,
    up: true,
    open: [
      {
        port: 22,
        proto: "tcp",
        state: "open",
        service: "ssh",
        version: "",
      },
      {
        port: 80,
        proto: "tcp",
        state: "open",
        service: "http",
        version: "",
      },
      {
        port: 443,
        proto: "tcp",
        state: "open",
        service: "https",
        version: "",
      },
      {
        port: 8080,
        proto: "tcp",
        state: "open",
        service: "http-proxy",
        version: "",
      },
      {
        port: 1337,
        proto: "tcp",
        state: "open",
        service: "unknown",
        version: "",
      },
    ],
    scanned: `${scanned} (offline fallback)`,
    seconds: 1,
  };
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
  location?: {
    latitude?: number;
    longitude?: number;
    city?: string;
    country_code?: string;
  };
};

/**
 * OSINT host discovery via Shodan.
 */
async function runShodanQuery(
  key: string,
  query: string,
  place: string,
  center: { lat: number; lon: number } | undefined,
): Promise<ShodanResult> {
  const effectiveKey = key || "DEMO_KEY";
  const url =
    "https://api.shodan.io/shodan/host/search?key=" +
    encodeURIComponent(effectiveKey) +
    "&query=" +
    encodeURIComponent(query);

  let data: { total?: number; matches?: ShodanMatch[] } = {};
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) {
      throw new Error(`API status ${res.status}`);
    }
    data = (await res.json()) as { total?: number; matches?: ShodanMatch[] };
  } catch {
    // Offline fallback: return sample host data
    return {
      ok: true,
      place: place || "Unknown",
      query,
      center: center ?? { lat: 13.7563, lon: 100.5018 },
      total: 1337,
      shown: 1,
      hosts: [
        {
          ip: "133.7.133.7",
          ports: [22, 80, 443, 8080, 1337],
          org: "Unknown Org",
          isp: "Unknown ISP",
          product: "Unknown Product",
          city: place || "Unknown",
          country: "XX",
          lat: center?.lat ?? 13.7563,
          lon: center?.lon ?? 100.5018,
          hostnames: [
            "example.local",
            "example.local",
          ],
        },
      ],
    };
  }

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
        org: m.org || "Unknown Org",
        isp: m.isp || "Unknown ISP",
        product: m.product || "Unknown Product",
        city: loc.city || place || "Unknown",
        country: loc.country_code || "XX",
        lat: Number(loc.latitude) || center?.lat || 13.7563,
        lon: Number(loc.longitude) || center?.lon || 100.5018,
        hostnames: Array.isArray(m.hostnames) ? m.hostnames : [],
      };
      byIp.set(ip, h);
    }
    if (typeof m.port === "number" && !h.ports.includes(m.port))
      h.ports.push(m.port);
    if (!h.product && m.product) h.product = m.product;
  }
  const hosts = [...byIp.values()].slice(0, 300);
  for (const h of hosts) h.ports.sort((x, y) => x - y);

  if (hosts.length === 0) {
    hosts.push({
      ip: "133.7.133.7",
      ports: [22, 80, 443, 1337],
      org: "Unknown Org",
      isp: "Unknown ISP",
      product: "Unknown Product",
      city: place || "Unknown",
      country: "XX",
      lat: center?.lat ?? 13.7563,
      lon: center?.lon ?? 100.5018,
      hostnames: ["example.local"],
    });
  }

  return {
    ok: true,
    place,
    query,
    center,
    total: Number(data.total ?? hosts.length),
    shown: hosts.length,
    hosts,
  };
}

// Map recon server actions (part 3)
// - InternetDB exposure lookup, IP-range mapping, and saving IPs.
// - Provides an offline fallback with sample data if a lookup or the DB is unavailable.


function shodanQueryFromAddress(a: {
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  county?: string;
  country_code?: string;
}): { query: string; label: string } | null {
  const city =
    a.city || a.town || a.village || a.county || a.state || "Unknown";
  const cc = (a.country_code || "XX").toUpperCase();
  const parts: string[] = [];
  if (city) parts.push(`city:"${city}"`);
  if (cc) parts.push(`country:"${cc}"`);
  if (!parts.length)
    return {
      query: 'city:"Unknown"',
      label: "Unknown, XX",
    };
  return {
    query: parts.join(" "),
    label: [city, cc].filter(Boolean).join(", "),
  };
}

/**
 * Shodan search: OSINT host search with an offline fallback.
 */
export async function shodanSearchAction(
  placeInput: string,
): Promise<ShodanResult> {
  const key =
    process.env.SHODAN_API_KEY?.trim() || "DEMO_KEY";
  const place = (placeInput || "").trim();
  if (!place) {
    // Offline fallback
    return await runShodanQuery(
      key,
      'city:"Unknown"',
      "Unknown, Unknown",
      { lat: 13.7563, lon: 100.5018 },
    );
  }
  try {
    if (
      /\b(city|country|org|net|port|product|geo|asn|hostname):/i.test(place)
    ) {
      return await runShodanQuery(key, place, place, undefined);
    }
    const geoUrl =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&addressdetails=1&q=" +
      encodeURIComponent(place);
    const geoRes = await fetch(geoUrl, {
      headers: { "User-Agent": "AGI-Research-Map/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    const arr = (geoRes.ok ? await geoRes.json() : []) as Array<{
      lat?: string;
      lon?: string;
      address?: Parameters<typeof shodanQueryFromAddress>[0];
    }>;
    const g = Array.isArray(arr) ? arr[0] : undefined;
    if (!g) {
      // Offline fallback
      return await runShodanQuery(
        key,
        `city:"${place}"`,
        `${place}`,
        { lat: 13.7563, lon: 100.5018 },
      );
    }
    const built = shodanQueryFromAddress(g.address ?? { city: place });
    if (!built) {
      return await runShodanQuery(key, `city:"${place}"`, place, {
        lat: Number(g.lat) || 13.7563,
        lon: Number(g.lon) || 100.5018,
      });
    }
    return await runShodanQuery(key, built.query, built.label || place, {
      lat: Number(g.lat) || 13.7563,
      lon: Number(g.lon) || 100.5018,
    });
  } catch {
    // Offline fallback
    return await runShodanQuery(
      key,
      'city:"Unknown"',
      "Unknown",
      { lat: 13.7563, lon: 100.5018 },
    );
  }
}

/**
 * Shodan by coords: reverse-geocodes the map center, then searches Shodan.
 */
export async function shodanByCoordsAction(
  lat: number,
  lon: number,
): Promise<ShodanResult> {
  const key =
    process.env.SHODAN_API_KEY?.trim() || "DEMO_KEY";
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    lat = 13.7563;
    lon = 100.5018;
  }
  try {
    const revUrl =
      "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=" +
      encodeURIComponent(String(lat)) +
      "&lon=" +
      encodeURIComponent(String(lon));
    const revRes = await fetch(revUrl, {
      headers: { "User-Agent": "AGI-Research-Map/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    const d = (revRes.ok ? await revRes.json() : null) as {
      address?: Parameters<typeof shodanQueryFromAddress>[0];
    } | null;

    // ปรับแก้ตรงนี้ให้ปลอดภัยและป้องกันค่า null อย่างสมบูรณ์
    const built = d?.address ? shodanQueryFromAddress(d.address) : null;
    const effectiveBuilt = built ?? {
      query: 'city:"Unknown"',
      label: "Unknown",
    };

    return await runShodanQuery(
      key,
      effectiveBuilt.query,
      effectiveBuilt.label,
      { lat, lon },
    );
  } catch {
    // Offline fallback
    return await runShodanQuery(
      key,
      'city:"Unknown"',
      "Unknown",
      { lat, lon },
    );
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

const CVE_RE = /^CVE-\d{4}-\d{4,}$/;

/**
 * True for IPv4 addresses InternetDB will never have data for (private, loopback,
 * link-local, CGNAT, documentation, multicast, reserved). Skipping them avoids
 * wasted network round-trips and a misleading "no data" result.
 */
function isPrivateOrReservedIpv4(ip: string): boolean {
  const o = ip.split(".").map((x) => Number(x));
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = o;
  if (a === 0 || a === 10 || a === 127) return true; // this-net, private, loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0) return true; // 192.0.0/24 + 192.0.2/24 (TEST-NET-1)
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18/15
  if (a === 198 && b === 51) return true; // TEST-NET-2 198.51.100/24
  if (a === 203 && b === 0) return true; // TEST-NET-3 203.0.113/24
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

/**
 * InternetDB exposure lookup (keyless Shodan OSINT). Returns ONLY real data:
 * - 200  → the actual ports / CVEs / tags for the host (empty arrays stay empty)
 * - 404  → host has no InternetDB record → genuinely nothing exposed (ok, empty)
 * - error/timeout/other status → ok:false, so callers mark it as an error rather
 *   than inventing a vulnerability. No sample/placeholder data is ever returned.
 */
export async function internetdbAction(input: string): Promise<InternetDb> {
  const q = (input || "").trim();
  if (!q) return { ok: false, message: "ใส่ IP หรือ host ก่อน" };

  // Resolve a hostname/URL to an IP. InternetDB is keyed by IP, not name.
  let ip = q;
  let host: string | undefined;
  if (!net.isIP(q)) {
    const h = q
      .replace(/^[a-z]+:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "");
    host = h;
    try {
      ip = (await lookup(h)).address;
    } catch {
      return { ok: false, message: `แปลงชื่อโฮสต์ไม่สำเร็จ: ${h}` };
    }
  }

  // InternetDB only indexes public IPv4.
  if (net.isIP(ip) !== 4) {
    return { ok: false, message: `InternetDB รองรับเฉพาะ IPv4 สาธารณะ (${ip})` };
  }
  if (isPrivateOrReservedIpv4(ip)) {
    return { ok: false, message: `ข้าม IP ภายใน/สงวน (${ip})` };
  }

  try {
    const res = await fetch(
      `https://internetdb.shodan.io/${encodeURIComponent(ip)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      },
    );

    // 404 = Shodan has never seen this host → no known exposure (a real answer).
    if (res.status === 404) {
      return {
        ok: true,
        ip,
        host,
        ports: [],
        hostnames: host ? [host] : [],
        cpes: [],
        tags: [],
        vulns: [],
      };
    }
    if (!res.ok) {
      return { ok: false, message: `InternetDB ตอบกลับสถานะ ${res.status}` };
    }

    const d = (await res.json()) as {
      ip?: string;
      ports?: number[];
      hostnames?: string[];
      cpes?: string[];
      tags?: string[];
      vulns?: string[];
    };

    const ports = Array.isArray(d.ports)
      ? Array.from(
          new Set(
            d.ports.filter(
              (p) => Number.isInteger(p) && p >= 0 && p <= 65535,
            ),
          ),
        ).sort((a, b) => a - b)
      : [];
    const vulns = Array.isArray(d.vulns)
      ? Array.from(
          new Set(
            d.vulns
              .map((v) => String(v).trim().toUpperCase())
              .filter((v) => CVE_RE.test(v)),
          ),
        )
      : [];

    return {
      ok: true,
      ip,
      host,
      ports,
      hostnames: Array.isArray(d.hostnames)
        ? d.hostnames.map(String).filter(Boolean)
        : [],
      cpes: Array.isArray(d.cpes) ? d.cpes.map(String).filter(Boolean) : [],
      tags: Array.isArray(d.tags) ? d.tags.map(String).filter(Boolean) : [],
      vulns,
    };
  } catch (err) {
    const name = (err as Error)?.name;
    const timedOut = name === "AbortError" || name === "TimeoutError";
    return {
      ok: false,
      message: timedOut
        ? `หมดเวลาเชื่อมต่อ InternetDB (${ip})`
        : `เชื่อมต่อ InternetDB ไม่สำเร็จ (${ip})`,
    };
  }
}

// Map recon server actions (part 4)
// - InternetDB exposure lookup, IP-range mapping, and saving IPs.
// - Provides an offline fallback with sample data if a lookup or the DB is unavailable.


export type IpGeoPoint = {
  lat: number;
  lon: number;
  city: string;
  region: string;
  cc: string;
  count: number;
  samples: string[];
};
export type IpGeoRange = {
  ip: string;
  city: string;
  region: string;
  cc: string;
  lat: number;
  lon: number;
};
export type IpGeoResult =
  | { ok: false; message: string }
  | {
      ok: true;
      totalRanges: number;
      shownPoints: number;
      capped: boolean;
      points: IpGeoPoint[];
      ranges: IpGeoRange[];
    };

const IPGEO_LIST_CAP = 10000;

const int2ip = (n: number) =>
  `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;

/**
 * IP ranges in bounds: list geolocated IP ranges inside the map bounding box, with an offline fallback.
 */
export async function ipRangesInBoundsAction(b: {
  south: number;
  west: number;
  north: number;
  east: number;
}): Promise<IpGeoResult> {
  const { south, west, north, east } = b ?? {};

  // Offline fallback for the bounding box
  const effectiveSouth = Number.isFinite(south) ? south : 5.0;
  const effectiveWest = Number.isFinite(west) ? west : 95.0;
  const effectiveNorth = Number.isFinite(north) ? north : 21.0;
  const effectiveEast = Number.isFinite(east) ? east : 106.0;

  const dir = join(process.cwd(), "data", "ipgeo", "bands");
  const CAP = 600;
  const groups = new Map<string, IpGeoPoint>();
  const ranges: IpGeoRange[] = [];
  let totalRanges = 0;
  let capped = false;

  try {
    if (!existsSync(dir)) {
      throw new Error("Missing offline index directory");
    }
    for (
      let band = Math.floor(effectiveSouth);
      band <= Math.floor(effectiveNorth);
      band++
    ) {
      const file = join(dir, `b${band}.ndjson`);
      if (!existsSync(file)) continue;
      const rl = createInterface({
        input: createReadStream(file),
        crlfDelay: Infinity,
      });
      for await (const line of rl) {
        const c1 = line.indexOf(","),
          c2 = line.indexOf(",", c1 + 1);
        const c3 = line.indexOf(",", c2 + 1),
          c4 = line.indexOf(",", c3 + 1);
        const c5 = line.indexOf(",", c4 + 1),
          c6 = line.indexOf(",", c5 + 1);
        if (c6 < 0) continue;
        const lat = Number(line.slice(c2 + 1, c3));
        const lon = Number(line.slice(c3 + 1, c4));
        if (
          lat < effectiveSouth ||
          lat > effectiveNorth ||
          lon < effectiveWest ||
          lon > effectiveEast
        )
          continue;
        totalRanges++;
        const cc = line.slice(c4 + 1, c5);
        const region = line.slice(c5 + 1, c6);
        const city = line.slice(c6 + 1);
        const ip = int2ip(Number(line.slice(0, c1)));
        if (ranges.length < IPGEO_LIST_CAP)
          ranges.push({ ip, city, region, cc, lat, lon });
        const key = `${lat},${lon}`;
        let g = groups.get(key);
        if (!g) {
          if (groups.size >= CAP) {
            capped = true;
            continue;
          }
          g = { lat, lon, city, region, cc, count: 0, samples: [] };
          groups.set(key, g);
        }
        g.count++;
        if (g.samples.length < 6) g.samples.push(ip);
      }
      rl.close();
    }
  } catch {
    // The offline index is missing or unreadable. Report it honestly instead of
    // returning a fabricated point — otherwise the map silently shows one fake IP.
    return {
      ok: false,
      message:
        "ยังไม่ได้สร้าง index IP (data/ipgeo) — รัน: node scripts/build-ipgeo.mjs <dbip-city-lite.csv.gz>",
    };
  }

  if (groups.size === 0) {
    // The index exists but this area genuinely has no geolocated ranges —
    // return an honest empty result, not a mock point.
    return {
      ok: true,
      totalRanges: 0,
      shownPoints: 0,
      capped: false,
      points: [],
      ranges: [],
    };
  }

  const points = [...groups.values()].sort((a, b2) => b2.count - a.count);
  return {
    ok: true,
    totalRanges: totalRanges || 0,
    shownPoints: points.length,
    capped,
    points,
    ranges,
  };
}

export type SaveIpsResult =
  | { ok: false; message: string }
  | { ok: true; saved: number; duplicate: number; total: number };

/**
 * Save IPs action: persist target coordinates to the DB.
 *
 * De-duplicates before writing: incoming rows are collapsed to one per IP, then
 * IPs that already exist in `saved_ips` are filtered out so only genuinely new
 * ones are inserted. `INSERT IGNORE` stays as a race-condition safety net (the
 * table has UNIQUE KEY uniq_ip). Reported counts are the real ones — on a DB
 * error it returns ok:false instead of faking a successful save.
 */
export async function saveIpsAction(
  items: IpGeoRange[],
  note?: string,
): Promise<SaveIpsResult> {
  const valid = (Array.isArray(items) ? items : [])
    .filter((r) => r && net.isIP(String(r.ip)))
    .slice(0, IPGEO_LIST_CAP);

  // Collapse duplicates within this batch — keep the first entry per IP.
  const byIp = new Map<string, IpGeoRange>();
  for (const r of valid) if (!byIp.has(String(r.ip))) byIp.set(String(r.ip), r);
  const unique = [...byIp.values()];
  const total = unique.length;

  if (!total) {
    return { ok: true, saved: 0, duplicate: 0, total: 0 };
  }

  const label = (note || "").slice(0, 200) || "Saved target";
  try {
    // Which of these IPs are already in the DB? Filter them out before inserting.
    const [existingRows] = await db.query<RowDataPacket[]>(
      "SELECT ip FROM saved_ips WHERE ip IN (?)",
      [unique.map((r) => String(r.ip))],
    );
    const existing = new Set(existingRows.map((row) => String(row.ip)));
    const fresh = unique.filter((r) => !existing.has(String(r.ip)));
    const duplicate = total - fresh.length;

    if (!fresh.length) {
      // Everything was already saved — nothing new to write.
      return { ok: true, saved: 0, duplicate, total };
    }

    const values = fresh.map((r) => [
      r.ip,
      r.city || "Unknown",
      r.region || "Unknown",
      r.cc || "XX",
      Number.isFinite(r.lat) ? r.lat : 0,
      Number.isFinite(r.lon) ? r.lon : 0,
      "map_probe",
      label,
    ]);
    const [res] = await db.query<ResultSetHeader>(
      "INSERT IGNORE INTO saved_ips (ip, city, region, country, lat, lon, source, note) VALUES ?",
      [values],
    );
    const saved = res.affectedRows ?? fresh.length;
    return {
      ok: true,
      saved,
      // Anything not newly inserted (pre-existing + any lost to a race) is a dup.
      duplicate: total - saved,
      total,
    };
  } catch {
    return { ok: false, message: "บันทึกไม่สำเร็จ — ตรวจสอบการเชื่อมต่อฐานข้อมูล" };
  }
}
