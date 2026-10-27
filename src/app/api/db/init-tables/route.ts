import { NextResponse } from "next/server";
import mysql from "mysql2/promise";

// Narrow, one-time migration endpoint: creates ONLY the two tables the auto /
// approval controls need (`settings`, `command_approvals`). It is NOT a shell
// runner and not the full db:setup — it does not create the database or user,
// run arbitrary SQL, or write any file. The MySQL admin password is used for a
// single connection and never stored or logged.

const TABLES: { name: string; sql: string }[] = [
  {
    name: "settings",
    sql: `CREATE TABLE IF NOT EXISTS settings (
      name VARCHAR(100) NOT NULL,
      value VARCHAR(255) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (name)
    ) ENGINE=InnoDB`,
  },
  {
    name: "command_approvals",
    sql: `CREATE TABLE IF NOT EXISTS command_approvals (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      run_id BIGINT UNSIGNED NULL,
      agent_id BIGINT UNSIGNED NULL,
      command TEXT NOT NULL,
      reason TEXT NULL,
      tier VARCHAR(20) NOT NULL DEFAULT 'intrusive',
      status ENUM('pending','approved','denied','timeout') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP NULL,
      PRIMARY KEY (id),
      KEY idx_approvals_status (status, created_at)
    ) ENGINE=InnoDB`,
  },
  {
    name: "lessons",
    sql: `CREATE TABLE IF NOT EXISTS lessons (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      kind VARCHAR(20) NOT NULL DEFAULT 'retrospective',
      tags VARCHAR(255) NOT NULL DEFAULT '',
      problem TEXT NULL,
      solution TEXT NOT NULL,
      run_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_lessons_created (created_at)
    ) ENGINE=InnoDB`,
  },
];

export async function POST(request: Request) {
  let password: unknown;
  let adminUser: unknown;
  try {
    ({ password, adminUser } = (await request.json()) as { password?: unknown; adminUser?: unknown });
  } catch {
    return NextResponse.json({ error: "expected JSON { password }" }, { status: 400 });
  }
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "MySQL admin password required" }, { status: 400 });
  }

  let conn: mysql.Connection | undefined;
  try {
    conn = await mysql.createConnection({
      host: process.env.DATABASE_HOST ?? "127.0.0.1",
      port: Number(process.env.DATABASE_PORT ?? 3306),
      database: process.env.DATABASE_NAME ?? "agi_research",
      user: (typeof adminUser === "string" && adminUser.trim()) || process.env.MYSQL_ADMIN_USER || "root",
      password,
    });
    for (const t of TABLES) await conn.query(t.sql);
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('settings','command_approvals','lessons')`,
    );
    return NextResponse.json({ ok: true, created: TABLES.map((t) => t.name), present: rows.map((r) => r.t) });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const msg = code === "ER_ACCESS_DENIED_ERROR" ? "เข้าสู่ระบบ MySQL ไม่สำเร็จ — ตรวจรหัส admin" : err instanceof Error ? err.message : "init failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  } finally {
    await conn?.end().catch(() => {});
  }
}
