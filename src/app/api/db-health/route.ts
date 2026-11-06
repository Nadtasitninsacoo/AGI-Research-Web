import { connection, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  await connection();
  try {
    const [rows] = await db.query("SELECT COUNT(*) AS tables_count FROM information_schema.tables WHERE table_schema = DATABASE()");
    return NextResponse.json({ status: "connected", ...(rows as object[])[0] });
  } catch {
    return NextResponse.json(
      { status: "disconnected", message: "Cannot connect to MySQL" },
      { status: 503 },
    );
  }
}
