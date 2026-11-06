import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

// Operator switch for the engine's auto-approval of intrusive-tier actions.
// Stored in `settings`; the engine reads it live per run. `forbidden`-tier
// actions are denied regardless of this flag.

const KEY = "auto_approve_intrusive";

async function read(): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>(`SELECT value FROM settings WHERE name = ? LIMIT 1`, [KEY]);
  return /^(1|true|yes)$/i.test(String(rows[0]?.value ?? ""));
}

export async function GET() {
  try {
    return NextResponse.json({ autoApproveIntrusive: await read() });
  } catch {
    // Table not created yet (run `npm run db:setup`): report the safe default.
    return NextResponse.json({ autoApproveIntrusive: false, unavailable: true });
  }
}

export async function POST(request: Request) {
  let enabled: unknown;
  try {
    ({ enabled } = (await request.json()) as { enabled?: unknown });
  } catch {
    return NextResponse.json({ error: "expected JSON { enabled: boolean }" }, { status: 400 });
  }
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "`enabled` must be a boolean" }, { status: 400 });
  }
  try {
    await db.query(
      `INSERT INTO settings (name, value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [KEY, enabled ? "1" : "0"],
    );
    return NextResponse.json({ autoApproveIntrusive: enabled });
  } catch {
    return NextResponse.json({ error: "settings table unavailable; run `npm run db:setup`" }, { status: 503 });
  }
}
