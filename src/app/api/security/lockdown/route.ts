import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

// Sentinel kill switch. Stored in `settings.engine_lockdown`; the engine reads it
// live before every command (engine/src/sentinel.mjs). While engaged, ALL engine
// commands are halted — a purely DEFENSIVE stop, never a hack-back.

const KEY = "engine_lockdown";

async function read(): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>(`SELECT value FROM settings WHERE name = ? LIMIT 1`, [KEY]);
  return /^(1|true|yes)$/i.test(String(rows[0]?.value ?? ""));
}

export async function GET() {
  try {
    return NextResponse.json({ lockdown: await read() });
  } catch {
    return NextResponse.json({ lockdown: false, unavailable: true });
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
    // Leave an audit trail in the same stream the monitor reads.
    await db
      .query(
        `INSERT INTO security_events (kind, severity, detail) VALUES (?, ?, ?)`,
        ["lockdown", enabled ? "critical" : "info", `LOCKDOWN ${enabled ? "ENGAGED" : "lifted"} by operator (web)`],
      )
      .catch(() => {});
    return NextResponse.json({ lockdown: enabled });
  } catch {
    return NextResponse.json({ error: "settings table unavailable; run DB init first" }, { status: 503 });
  }
}
