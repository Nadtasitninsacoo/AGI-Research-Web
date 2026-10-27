import { NextResponse } from "next/server";
import mysql from "mysql2/promise";

// Narrow, one-time migration endpoint: creates ONLY the two tables the auto /
// approval controls need (`settings`, `command_approvals`) plus `lessons`, and
// applies a small set of fixed, idempotent column migrations. It is NOT a shell
// runner and not the full db:setup — it does not create the database or user,
// run arbitrary SQL, or write any file. The MySQL admin password is used for a
// single connection and never stored or logged.

// Fixed, idempotent schema migrations for existing databases. Re-running them
// just re-applies the same definition, so they are safe to click more than once.
const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "experiment_runs.status += needs_input",
    sql: `ALTER TABLE experiment_runs MODIFY COLUMN status
      ENUM('queued','running','succeeded','failed','needs_input','cancelled') NOT NULL DEFAULT 'queued'`,
  },
  {
    name: "saved_ips += region",
    sql: `ALTER TABLE saved_ips ADD COLUMN region VARCHAR(160) NULL AFTER city`,
  },
  {
    name: "saved_ips += scanned_at",
    sql: `ALTER TABLE saved_ips ADD COLUMN scanned_at TIMESTAMP NULL DEFAULT NULL`,
  },
];

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
  {
    name: "saved_ports",
    sql: `CREATE TABLE IF NOT EXISTS saved_ports (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      ip VARCHAR(45) NOT NULL,
      port INT UNSIGNED NOT NULL,
      service VARCHAR(60) NULL,
      cves INT UNSIGNED NOT NULL DEFAULT 0,
      hostname VARCHAR(255) NULL,
      source VARCHAR(40) NOT NULL DEFAULT 'internetdb',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_ip_port (ip, port),
      KEY idx_port (port),
      KEY idx_service (service)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  {
    name: "saved_ips",
    sql: `CREATE TABLE IF NOT EXISTS saved_ips (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      ip VARCHAR(45) NOT NULL,
      city VARCHAR(160) NULL,
      region VARCHAR(160) NULL,
      country VARCHAR(8) NULL,
      lat DOUBLE NULL,
      lon DOUBLE NULL,
      source VARCHAR(40) NOT NULL DEFAULT 'db-ip',
      note VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_ip (ip)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
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
    // Apply fixed column migrations; tolerate ones that cannot run yet (e.g. a
    // fresh DB without experiment_runs) so table creation still reports success.
    const migrated: string[] = [];
    for (const m of MIGRATIONS) {
      try {
        await conn.query(m.sql);
        migrated.push(m.name);
      } catch {
        /* table may not exist on a bare DB — ignore */
      }
    }
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('settings','command_approvals','lessons','saved_ips','saved_ports')`,
    );
    return NextResponse.json({ ok: true, created: TABLES.map((t) => t.name), present: rows.map((r) => r.t), migrated });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const msg = code === "ER_ACCESS_DENIED_ERROR" ? "เข้าสู่ระบบ MySQL ไม่สำเร็จ — ตรวจรหัส admin" : err instanceof Error ? err.message : "init failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  } finally {
    await conn?.end().catch(() => {});
  }
}
