// Creates the AGI database, an app-level user, and applies db/schema.sql.
// Usage: MYSQL_ADMIN_PASSWORD=... node scripts/db-setup.mjs
// Admin credentials come from the environment only and are never written to disk.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import mysql from "mysql2/promise";

const host = process.env.MYSQL_HOST ?? "127.0.0.1";
const port = Number(process.env.MYSQL_PORT ?? 3306);
const adminUser = process.env.MYSQL_ADMIN_USER ?? "root";
const adminPassword = process.env.MYSQL_ADMIN_PASSWORD;
const dbName = process.env.DATABASE_NAME ?? "agi_research";
const appUser = process.env.DATABASE_USER ?? "agi_app";
const envFile = ".env.local";

if (adminPassword === undefined) {
  console.error("Set MYSQL_ADMIN_PASSWORD before running this script.");
  process.exit(1);
}

const envText = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const existing = envText.match(/^DATABASE_PASSWORD=(.+)$/m)?.[1];
const appPassword = existing ?? randomBytes(18).toString("base64url");

const conn = await mysql.createConnection({
  host,
  port,
  user: adminUser,
  password: adminPassword,
  multipleStatements: true,
});

try {
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await conn.query(
    "CREATE USER IF NOT EXISTS ?@'localhost' IDENTIFIED BY ?",
    [appUser, appPassword],
  );
  await conn.query("ALTER USER ?@'localhost' IDENTIFIED BY ?", [
    appUser,
    appPassword,
  ]);
  await conn.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON \`${dbName}\`.* TO ?@'localhost'`,
    [appUser],
  );

  await conn.query(`USE \`${dbName}\``);
  await conn.query(readFileSync("db/schema.sql", "utf8"));

  const [tables] = await conn.query("SHOW TABLES");
  console.log(`Database "${dbName}" ready with ${tables.length} tables.`);
} finally {
  await conn.end();
}

if (!existing) {
  const lines = [
    "",
    `DATABASE_HOST=${host}`,
    `DATABASE_PORT=${port}`,
    `DATABASE_NAME=${dbName}`,
    `DATABASE_USER=${appUser}`,
    `DATABASE_PASSWORD=${appPassword}`,
    "",
  ];
  appendFileSync(envFile, lines.join("\n"));
  console.log(`App credentials written to ${envFile}.`);
}
