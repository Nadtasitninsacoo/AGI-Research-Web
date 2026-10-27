"use server";

import { lookup } from "node:dns/promises";
import net from "node:net";
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
