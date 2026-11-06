import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

// Recent security events + a 24h severity tally for the counter-attack monitor.

export async function GET() {
  try {
    const [events] = await db.query<RowDataPacket[]>(
      `SELECT id, kind, severity, run_id, agent_id, command, detail, created_at
       FROM security_events ORDER BY id DESC LIMIT 50`,
    );
    const [tally] = await db.query<RowDataPacket[]>(
      `SELECT severity, COUNT(*) AS n FROM security_events
       WHERE created_at >= (NOW() - INTERVAL 1 DAY) GROUP BY severity`,
    );
    const counts: Record<string, number> = { info: 0, warn: 0, high: 0, critical: 0 };
    for (const r of tally) counts[String(r.severity)] = Number(r.n);
    return NextResponse.json({ events, counts });
  } catch {
    return NextResponse.json({ events: [], counts: {}, unavailable: true });
  }
}
