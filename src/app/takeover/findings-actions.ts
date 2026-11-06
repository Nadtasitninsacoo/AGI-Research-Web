"use server";

// Persist confirmed vulnerability findings from the Vuln Analysis page.
// Saves IP, port, service, severity, CVE list and a VULNERABLE/CLEAN status.

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

export type VulnFindingInput = {
  ip: string;
  port: number;
  service: string | null;
  hostname: string | null;
  severity: string;
  score: number;
  cves: number;
  vulnIds: string[];
  exposure: string | null;
  remediation: string | null;
  status: string;
};

export type SaveFindingsResult = {
  ok: boolean;
  message: string;
  saved?: number;
};

const CVE_RE = /^CVE-\d{4}-\d{4,}$/;

const INIT_MSG =
  'ยังไม่มีตาราง vuln_findings — ไปที่หน้า Command กด "Initialize tables" (รหัส admin) ก่อน แล้วลองบันทึกอีกครั้ง';

/**
 * Upsert a batch of findings (keyed by ip+port). The table is created by the
 * admin "Initialize tables" step (the app DB user has DML rights only, no CREATE).
 */
export async function saveVulnFindings(
  findings: VulnFindingInput[],
): Promise<SaveFindingsResult> {
  const list = (Array.isArray(findings) ? findings : []).filter(
    (f): f is VulnFindingInput =>
      !!f &&
      typeof f.ip === "string" &&
      f.ip.trim().length > 0 &&
      Number.isInteger(f.port) &&
      f.port >= 0 &&
      f.port <= 65535,
  );
  if (!list.length) return { ok: false, message: "ไม่มีข้อมูลให้บันทึก" };

  try {
    const values = list.slice(0, 20000).map((f) => {
      const cveIds = Array.isArray(f.vulnIds)
        ? Array.from(
            new Set(
              f.vulnIds
                .map((v) => String(v).trim().toUpperCase())
                .filter((v) => CVE_RE.test(v)),
            ),
          )
        : [];
      return [
        f.ip.trim(),
        f.port,
        f.service ?? null,
        f.hostname ?? null,
        String(f.severity || "INFO"),
        Math.round(Number(f.score) || 0),
        Math.max(0, Math.round(Number(f.cves) || 0)),
        cveIds.length ? JSON.stringify(cveIds) : null,
        f.exposure ?? null,
        f.remediation ?? null,
        f.status === "CLEAN" ? "CLEAN" : "VULNERABLE",
      ];
    });

    const [res] = await db.query<ResultSetHeader>(
      `INSERT INTO vuln_findings
         (ip, port, service, hostname, severity, score, cves, vuln_ids, exposure, remediation, status)
       VALUES ?
       ON DUPLICATE KEY UPDATE
         service=VALUES(service), hostname=VALUES(hostname), severity=VALUES(severity),
         score=VALUES(score), cves=VALUES(cves), vuln_ids=VALUES(vuln_ids),
         exposure=VALUES(exposure), remediation=VALUES(remediation), status=VALUES(status),
         updated_at=CURRENT_TIMESTAMP`,
      [values],
    );

    return {
      ok: true,
      message: `บันทึกช่องโหว่ ${list.length} รายการลงฐานข้อมูลแล้ว`,
      saved: res.affectedRows,
    };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "ER_NO_SUCH_TABLE") {
      return { ok: false, message: INIT_MSG };
    }
    return { ok: false, message: "บันทึกช่องโหว่ลงฐานข้อมูลไม่สำเร็จ" };
  }
}

export type SavedFinding = {
  id: number;
  ip: string;
  port: number;
  service: string | null;
  hostname: string | null;
  severity: string;
  score: number;
  cves: number;
  vulnIds: string[];
  exposure: string | null;
  remediation: string | null;
  status: string;
  updatedAt: string | null;
};

/** Read saved findings (most recent first); [] if the table does not exist yet. */
export async function listVulnFindings(limit = 1000): Promise<SavedFinding[]> {
  const n = Math.min(Math.max(Math.floor(limit) || 1, 1), 5000);
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, ip, port, service, hostname, severity, score, cves, vuln_ids, exposure, remediation, status, updated_at
       FROM vuln_findings ORDER BY updated_at DESC, id DESC LIMIT ?`,
      [n],
    );
    return rows.map((r) => {
      let vulnIds: string[] = [];
      try {
        const raw = r.vuln_ids;
        if (Array.isArray(raw)) vulnIds = raw.map(String);
        else if (typeof raw === "string" && raw.trim())
          vulnIds = JSON.parse(raw) as string[];
      } catch {
        vulnIds = [];
      }
      return {
        id: Number(r.id),
        ip: String(r.ip),
        port: Number(r.port),
        service: r.service == null ? null : String(r.service),
        hostname: r.hostname == null ? null : String(r.hostname),
        severity: String(r.severity ?? "INFO"),
        score: Number(r.score ?? 0),
        cves: Number(r.cves ?? 0),
        vulnIds,
        exposure: r.exposure == null ? null : String(r.exposure),
        remediation: r.remediation == null ? null : String(r.remediation),
        status: String(r.status ?? "VULNERABLE"),
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
      };
    });
  } catch {
    return [];
  }
}
