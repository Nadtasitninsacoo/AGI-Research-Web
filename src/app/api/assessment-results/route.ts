import { connection, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Read-only listing of the security_assessment_* tables.
// Sensitive columns (session_key, metadata) are intentionally NOT selected.
const LIMIT = 500;

const QUERIES = {
  findings: `SELECT id, assessment_id, task_id, title, description, category, severity,
                    asset_reference, remediation, status, discovered_at, created_at
             FROM security_assessment_findings ORDER BY id DESC LIMIT ${LIMIT}`,
  evidence: `SELECT id, assessment_id, finding_id, task_id, evidence_type,
                    storage_reference, sha256, collected_at, created_at
             FROM security_assessment_evidence ORDER BY id DESC LIMIT ${LIMIT}`,
  reports: `SELECT id, assessment_id, generated_by, report_format, status,
                   storage_reference, sha256, summary, generated_at, created_at
            FROM security_assessment_reports ORDER BY id DESC LIMIT ${LIMIT}`,
  tasks: `SELECT id, assessment_id, task_key, title, description, status,
                 result_summary, started_at, finished_at, created_at
          FROM security_assessment_tasks ORDER BY id DESC LIMIT ${LIMIT}`,
  sessions: `SELECT id, assessment_id, authorization_reference, authorized_by, status,
                    valid_from, expires_at, revoked_at, created_at
             FROM security_assessment_sessions ORDER BY id DESC LIMIT ${LIMIT}`,
} as const;

export async function GET() {
  await connection();
  try {
    const entries = await Promise.all(
      Object.entries(QUERIES).map(async ([key, sql]) => {
        const [rows] = await db.query(sql);
        return [key, rows] as const;
      }),
    );
    return NextResponse.json(Object.fromEntries(entries), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { message: "ไม่สามารถอ่านตาราง security_assessment_* ได้" },
      { status: 503 },
    );
  }
}
