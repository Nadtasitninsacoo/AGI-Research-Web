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
export async function portScanAction(input: string, opts?: { allPorts?: boolean }): Promise<PortScan> {
  const c = cleanTarget(input);
  if (!c.ok) return c;
  const topPorts = opts?.allPorts ? "1000" : "100";
  const scanned = opts?.allPorts ? "top 1000 TCP" : "top 100 TCP";
  const args = [
    "-sT",                    // TCP connect scan — no raw sockets, no admin needed
    "-Pn",                    // treat host as up (many hosts drop ping); we report "up" from port replies
    "-sV", "--version-light", // identify services, but the fast probe set only
    "--top-ports", topPorts,
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
