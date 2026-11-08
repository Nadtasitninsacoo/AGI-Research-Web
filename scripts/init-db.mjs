// One-command DB bootstrap (CLI equivalent of the "Initialize Database" button).
// Creates the database, applies db/schema.sql, creates the extra tables that live
// only in the init route (saved_ports, saved_ips, vuln_findings, authorized_scope,
// cve_intel), and runs the idempotent column migrations. Safe to re-run.
//
// Connects as MySQL root (the app user in .env.local usually lacks CREATE — that's
// why the "Initialize" button asks for the admin password). Host/port/db name come
// from .env.local; the admin user/password default to root with a blank password
// (Laragon), or pass them as args.
//
// Usage (from the web repo root):
//   node --env-file=.env.local scripts/init-db.mjs                 # root, no password (Laragon)
//   node --env-file=.env.local scripts/init-db.mjs root MyRootPass # root with a password
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DB_NAME = process.env.DATABASE_NAME || 'agi_research';
if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) {
  console.error(`Invalid DATABASE_NAME: ${DB_NAME}`);
  process.exit(1);
}

const EXTRA_TABLES = [
  `CREATE TABLE IF NOT EXISTS saved_ports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ip VARCHAR(45) NOT NULL, port INT UNSIGNED NOT NULL, service VARCHAR(60) NULL,
    cves INT UNSIGNED NOT NULL DEFAULT 0, vuln_ids TEXT NULL, hostname VARCHAR(255) NULL,
    source VARCHAR(40) NOT NULL DEFAULT 'internetdb', scanned_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uniq_ip_port (ip, port), KEY idx_port (port), KEY idx_service (service)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS saved_ips (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ip VARCHAR(45) NOT NULL,
    city VARCHAR(160) NULL, region VARCHAR(160) NULL, country VARCHAR(8) NULL,
    lat DOUBLE NULL, lon DOUBLE NULL, source VARCHAR(40) NOT NULL DEFAULT 'db-ip',
    note VARCHAR(255) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uniq_ip (ip)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS vuln_findings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ip VARCHAR(45) NOT NULL, port INT UNSIGNED NOT NULL,
    service VARCHAR(60) NULL, hostname VARCHAR(255) NULL, severity VARCHAR(16) NOT NULL,
    score INT NOT NULL DEFAULT 0, cves INT UNSIGNED NOT NULL DEFAULT 0, vuln_ids TEXT NULL,
    exposure VARCHAR(64) NULL, remediation TEXT NULL, status VARCHAR(24) NOT NULL DEFAULT 'VULNERABLE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uniq_ip_port (ip, port), KEY idx_status (status), KEY idx_severity (severity)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS authorized_scope (
    entry VARCHAR(255) NOT NULL, note VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (entry)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS cve_intel (
    cve_id VARCHAR(32) NOT NULL, cvss DECIMAL(3,1) NULL, severity VARCHAR(12) NULL,
    vector VARCHAR(160) NULL, published VARCHAR(32) NULL, description TEXT NULL,
    source VARCHAR(16) NOT NULL DEFAULT 'nvd', status VARCHAR(16) NOT NULL DEFAULT 'ok',
    fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (cve_id), KEY idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

const MIGRATIONS = [
  `ALTER TABLE experiment_runs MODIFY COLUMN status ENUM('queued','running','succeeded','failed','needs_input','cancelled') NOT NULL DEFAULT 'queued'`,
  `ALTER TABLE saved_ips ADD COLUMN scanned_at TIMESTAMP NULL DEFAULT NULL`,
  `ALTER TABLE saved_ports ADD COLUMN vuln_ids TEXT NULL`,
  `ALTER TABLE saved_ports ADD COLUMN scanned_at TIMESTAMP NULL DEFAULT NULL`,
];

// Admin (root) connection — needed to CREATE the database/tables. The app user in
// .env.local normally has DML only, so use root here.
const adminUser = process.argv[2] || process.env.MYSQL_ADMIN_USER || 'root';
const adminPassword = process.argv[3] ?? process.env.MYSQL_ADMIN_PASSWORD ?? '';

let conn;
try {
  conn = await mysql.createConnection({
    host: process.env.DATABASE_HOST || '127.0.0.1',
    port: Number(process.env.DATABASE_PORT ?? 3306),
    user: adminUser,
    password: adminPassword,
    multipleStatements: true,
  });

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${DB_NAME}\``);

  const schema = readFileSync(join(process.cwd(), 'db', 'schema.sql'), 'utf8');
  await conn.query(schema);
  console.log('applied db/schema.sql');

  for (const sql of EXTRA_TABLES) await conn.query(sql);
  console.log(`created ${EXTRA_TABLES.length} extra tables`);

  let migrated = 0;
  for (const sql of MIGRATIONS) {
    try { await conn.query(sql); migrated++; } catch { /* already applied / not ready */ }
  }
  console.log(`ran ${migrated}/${MIGRATIONS.length} migrations`);

  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?`, [DB_NAME],
  );
  console.log(`OK: database "${DB_NAME}" ready with ${rows[0].n} tables.`);
} catch (e) {
  console.error('FAILED:', e?.code || e?.message || e);
  if (e?.code === 'ECONNREFUSED') console.error('-> MySQL not running (start Laragon).');
  if (e?.code === 'ER_ACCESS_DENIED_ERROR') console.error('-> Wrong root password. Run: node --env-file=.env.local scripts/init-db.mjs root <ROOT_PASSWORD>  (Laragon root is usually blank).');
  if (e?.code === 'ER_DBACCESS_DENIED_ERROR') console.error('-> This user lacks CREATE privilege — use root.');
  process.exitCode = 1;
} finally {
  await conn?.end();
}
