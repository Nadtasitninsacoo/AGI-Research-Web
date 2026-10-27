// Shared MySQL pool for the engine worker.
// Resolves mysql2 from the repo-root node_modules (the engine has no deps of
// its own). Reuses one pool for the lifetime of the process.
import mysql from "mysql2/promise";
import { config } from "./config.mjs";

export const db = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  waitForConnections: true,
  connectionLimit: 5,
  charset: "utf8mb4",
});

/** Run a SELECT and return the rows. */
export async function query(sql, params = []) {
  const [rows] = await db.execute(sql, params);
  return rows;
}

/** Run an INSERT/UPDATE and return the result header (affectedRows, insertId). */
export async function execute(sql, params = []) {
  const [result] = await db.execute(sql, params);
  return result;
}
