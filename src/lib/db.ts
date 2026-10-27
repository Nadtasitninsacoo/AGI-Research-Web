import mysql from "mysql2/promise";

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { agiPool?: mysql.Pool };

function createPool() {
  return mysql.createPool({
    host: process.env.DATABASE_HOST ?? "127.0.0.1",
    port: Number(process.env.DATABASE_PORT ?? 3306),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    charset: "utf8mb4",
  });
}

export const db = (globalForDb.agiPool ??= createPool());
