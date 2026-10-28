import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import mysql from "mysql2/promise";

// One-click bootstrap for a fresh MySQL (e.g. Laragon, root with no password):
// creates the database if missing, applies the full db/schema.sql, creates the
// two tables not in that file (saved_ips, saved_ports), and runs the fixed,
// idempotent column migrations. Safe to re-run. The admin password is used for a
// single connection and never stored or logged; an EMPTY password is allowed so
// a default Laragon root works. It still does NOT run a shell or arbitrary SQL.

const DB_NAME = process.env.DATABASE_NAME ?? "agi_research";

// Tables that live only here, not in db/schema.sql.
const EXTRA_TABLES: { name: string; sql: string }[] = [
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

// Fixed, idempotent column migrations for existing databases. Re-running just
// re-applies the same definition; ones that cannot run yet are tolerated.
const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "experiment_runs.status += needs_input",
    sql: `ALTER TABLE experiment_runs MODIFY COLUMN status
      ENUM('queued','running','succeeded','failed','needs_input','cancelled') NOT NULL DEFAULT 'queued'`,
  },
  {
    name: "saved_ips += scanned_at",
    sql: `ALTER TABLE saved_ips ADD COLUMN scanned_at TIMESTAMP NULL DEFAULT NULL`,
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
  // Allow an empty password (Laragon root), but it must be a string.
  if (typeof password !== "string") {
    return NextResponse.json({ error: "expected a password string (may be empty)" }, { status: 400 });
  }

  let conn: mysql.Connection | undefined;
  try {
    // Connect WITHOUT selecting a database so this works before it exists.
    conn = await mysql.createConnection({
      host: process.env.DATABASE_HOST ?? "127.0.0.1",
      port: Number(process.env.DATABASE_PORT ?? 3306),
      user: (typeof adminUser === "string" && adminUser.trim()) || process.env.MYSQL_ADMIN_USER || "root",
      password,
      multipleStatements: true,
    });

    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await conn.query(`USE \`${DB_NAME}\``);

    // Full canonical schema (multiple statements).
    const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
    await conn.query(schema);

    // Tables not covered by schema.sql.
    for (const t of EXTRA_TABLES) await conn.query(t.sql);

    // Fixed column migrations; tolerate ones that cannot run yet.
    const migrated: string[] = [];
    for (const m of MIGRATIONS) {
      try {
        await conn.query(m.sql);
        migrated.push(m.name);
      } catch {
        /* column may already exist, or table not present yet — ignore */
      }
    }

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
      [DB_NAME],
    );
    return NextResponse.json({ ok: true, database: DB_NAME, present: rows.map((r) => r.t), migrated });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const msg =
      code === "ER_ACCESS_DENIED_ERROR"
        ? "เข้าสู่ระบบ MySQL ไม่สำเร็จ — ตรวจรหัส admin"
        : err instanceof Error
          ? err.message
          : "init failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  } finally {
    await conn?.end().catch(() => {});
  }
}
