import mysql from "mysql2/promise";

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { agiPool?: mysql.Pool };

function createPool() {
  const pool = mysql.createPool({
    host: process.env.DATABASE_HOST ?? "127.0.0.1",
    port: Number(process.env.DATABASE_PORT ?? 3306),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
    // Resilience: fail fast on a dead host, recycle idle connections, and keep
    // sockets alive so a transient blip doesn't surface as a hang.
    connectTimeout: 10_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    maxIdle: 10,
    idleTimeout: 60_000,
  });

  // A fatal pool-level error (e.g. the DB dropped the connection) is emitted as
  // an 'error' event; if nothing listens, Node can crash the whole process. Log
  // it instead — individual queries already surface failures via their try/catch.
  try {
    (pool as unknown as { on?: (e: string, cb: (err: unknown) => void) => void }).on?.(
      "error",
      (err) => {
        const code = (err as { code?: string })?.code ?? "UNKNOWN";
        console.error(`[db pool] non-fatal pool error (${code})`);
      },
    );
  } catch {
    /* some drivers don't expose .on — safe to ignore */
  }

  return pool;
}

export const db = (globalForDb.agiPool ??= createPool());
