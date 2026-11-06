import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

// Pending command approvals for the operator queue on the web.

export async function GET() {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT ca.id, ca.command, ca.reason, ca.tier, ca.created_at AS createdAt, ca.run_id AS runId, a.name AS agent
       FROM command_approvals ca
       LEFT JOIN agents a ON a.id = ca.agent_id
       WHERE ca.status = 'pending'
       ORDER BY ca.id ASC
       LIMIT 50`,
    );
    return NextResponse.json({ pending: rows });
  } catch {
    // Table not created yet (run `npm run db:setup`).
    return NextResponse.json({ pending: [], unavailable: true });
  }
}
