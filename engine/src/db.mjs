// Shared MySQL pool for the engine worker with offline fallback & limitless autonomy.
// Resolves mysql2 from the repo-root node_modules (the engine has no deps of
// its own). Reuses one pool for the lifetime of the process.
import mysql from "mysql2/promise";
import { config } from "./config.mjs";

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      waitForConnections: true,
      connectionLimit: 10,
      charset: "utf8mb4",
      connectTimeout: 5000,
    });
  }
  return pool;
}

/**
 * Run a SELECT and return the rows. Real errors are thrown — we never fake an
 * empty result set that would hide a database failure. Callers that can tolerate
 * a missing DB wrap this in try/catch themselves (e.g. readAutoApprove, log).
 */
export async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

/**
 * Run an INSERT/UPDATE and return the real result header. Real errors are thrown
 * — we never return a mock {insertId:1} success, which would fabricate run ids,
 * findings, or saved rows the dashboard then shows as real.
 */
export async function execute(sql, params = []) {
  const [result] = await getPool().execute(sql, params);
  return result;
}

/**
 * Check out a dedicated pooled connection for a multi-statement transaction
 * (e.g. SELECT ... FOR UPDATE SKIP LOCKED + UPDATE as one atomic claim). The
 * caller MUST release() it in a finally block.
 */
export async function getConnection() {
  return getPool().getConnection();
}