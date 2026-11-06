"use server";

import net from "node:net";

import { internetdbAction } from "@/app/map/actions";
import { saveScanPorts, type ExposureRow } from "@/app/recon/actions";

export type VulnScanResult =
  | { ok: false; message: string }
  | {
      ok: true;
      scanned: number;
      found: number; // total CVE identifiers discovered across all IPs
      saved: number; // rows written to saved_ports
      message: string;
    };

// Passive scans are keyless OSINT lookups against InternetDB — they do not
// probe the targets directly. Still, cap the batch so a single click cannot
// fan out into thousands of lookups.
const MAX_IPS_PER_SCAN = 40;
const CONCURRENCY = 5;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}

/**
 * Passive vulnerability scan: for each IP, look up its known exposure and CVEs
 * via InternetDB (OSINT), then persist the real CVE identifiers to saved_ports.
 */
export async function scanIpsForVulns(ips: string[]): Promise<VulnScanResult> {
  const unique = Array.from(
    new Set(
      (Array.isArray(ips) ? ips : [])
        .map((ip) => String(ip).trim())
        .filter((ip) => net.isIP(ip) !== 0),
    ),
  );

  if (!unique.length) {
    return { ok: false, message: "ไม่มี IP ที่ถูกต้องให้สแกน" };
  }

  if (unique.length > MAX_IPS_PER_SCAN) {
    return {
      ok: false,
      message: `สแกนได้สูงสุด ${MAX_IPS_PER_SCAN} IP ต่อครั้ง (ส่งมา ${unique.length}) — กรองให้แคบลงก่อน`,
    };
  }

  let rows: ExposureRow[];
  try {
    rows = await mapWithConcurrency(unique, CONCURRENCY, async (ip) => {
      try {
        const r = await internetdbAction(ip);
        if (!r.ok) {
          return {
            ip,
            ok: false,
            ports: [],
            hostnames: [],
            vulns: [],
            tags: [],
            error: r.message,
          } satisfies ExposureRow;
        }
        return {
          ip,
          ok: true,
          ports: Array.isArray(r.ports) ? r.ports : [],
          hostnames: Array.isArray(r.hostnames) ? r.hostnames : [],
          vulns: Array.isArray(r.vulns) ? r.vulns : [],
          tags: Array.isArray(r.tags) ? r.tags : [],
        } satisfies ExposureRow;
      } catch {
        return {
          ip,
          ok: false,
          ports: [],
          hostnames: [],
          vulns: [],
          tags: [],
          error: "lookup failed",
        } satisfies ExposureRow;
      }
    });
  } catch {
    return { ok: false, message: "การสแกนล้มเหลวระหว่างเรียก InternetDB" };
  }

  const found = rows.reduce(
    (sum, r) => sum + (Array.isArray(r.vulns) ? r.vulns.length : 0),
    0,
  );

  const persist = await saveScanPorts(rows);
  if (!persist.ok) {
    return { ok: false, message: persist.message };
  }

  return {
    ok: true,
    scanned: unique.length,
    found,
    saved: persist.saved ?? 0,
    message: `สแกน ${unique.length} IP — พบ CVE รวม ${found} รายการ, บันทึก ${persist.saved ?? 0} เรคคอร์ด`,
  };
}
