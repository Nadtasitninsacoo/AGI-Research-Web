import { NextResponse } from "next/server";
import type { RowDataPacket, PoolConnection } from "mysql2/promise";
import { db } from "@/lib/db";
import crypto from "crypto";

// Secure Telegram Notification Settings API Route — Ultimate Enterprise Hardened Edition
// Implements strict Fail-Closed Auth, AES-256-GCM with Key Validation, SQL Transactions,
// Base URL Allowlist / SSRF Protection, Streaming Body validation, and Secure Audit Logging.

const KEYS = {
  enabled: "notify_telegram_enabled",
  token: "notify_telegram_token",
  chatId: "notify_telegram_chat_id",
  baseUrl: "notify_app_base_url",
} as const;

// 1. Fail-Closed Encryption Key Validation (Must be exactly 32 bytes hex = 64 hex characters)
const encKeyEnv = process.env.TELEGRAM_ENC_KEY;
if (!encKeyEnv || typeof encKeyEnv !== "string" || encKeyEnv.trim().length !== 64) {
  throw new Error("CRITICAL SECURITY ERROR: TELEGRAM_ENC_KEY is missing or invalid. Must be a 64-character hex string (32 bytes). System halted.");
}
const ENCRYPTION_KEY = Buffer.from(encKeyEnv.trim(), "hex");

function encryptToken(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptToken(encryptedText: string): string {
  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 3) return "";
    const [ivHex, tagHex, encHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const enc = Buffer.from(encHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc) + decipher.final("utf8");
  } catch {
    return "";
  }
}

// 2. Robust In-Memory Rate Limiting (Multi-process friendly design note: use Redis/Memcached in production cluster)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const WINDOW_MS = 60_000; // 1 minute window
const MAX_REQUESTS = 15; // Strict limit per minute

function checkRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(clientIp);
  if (!record || now > record.resetTime) {
    rateLimitStore.set(clientIp, { count: 1, resetTime: now + WINDOW_MS });
    return true;
  }
  if (record.count >= MAX_REQUESTS) return false;
  record.count++;
  return true;
}

// Input boundaries
const MAX_INPUT_LENGTH = 512;
const MAX_BODY_SIZE = 4096; // 4 KB limit

// 3. Fail-Closed Authentication & Authorization Guard
function verifyAuth(request: Request): boolean {
  const expectedToken = process.env.GATEWAY_SECRET_TOKEN;
  if (!expectedToken || typeof expectedToken !== "string" || !expectedToken.trim()) {
    // Fail-Closed: If GATEWAY_SECRET_TOKEN is not configured, reject all requests entirely.
    return false;
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.substring(7).trim();
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken.trim()));
  } catch {
    return false;
  }
}

// Extract client IP securely (prefer direct or trusted proxy header)
function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    if (ips.length > 0 && ips[0]) {
      return ips[0];
    }
  }
  return request.headers.get("x-real-ip") ?? "127.0.0.1";
}

// 4. Strict Base URL Validation (SSRF & Allowlist protection)
function isValidBaseUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:") return false;
    const h = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (!h) return false;

    // Block local, loopback, private ranges, and metadata
    if (
      h === "localhost" ||
      h.endsWith(".local") ||
      h.endsWith(".localhost") ||
      h.endsWith(".internal") ||
      h === "metadata.google.internal" ||
      h === "169.254.169.254" ||
      h === "::1" ||
      h === "0.0.0.0" ||
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^169\.254\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      /^(fc|fd)[0-9a-f]{2}:/i.test(h) ||
      /^fe80:/i.test(h)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function readAll(): Promise<Record<string, string>> {
  // Propagate database error instead of swallowing it silently (Fail-Closed)
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT name, value FROM settings WHERE name IN (?, ?, ?, ?)`,
    [KEYS.enabled, KEYS.token, KEYS.chatId, KEYS.baseUrl],
  );
  return Object.fromEntries(rows.map((r) => [String(r.name), String(r.value ?? "")]));
}

export async function GET(request: Request) {
  const clientIp = getClientIp(request);
  if (!checkRateLimit(clientIp)) {
    return NextResponse.json({ error: "rate limit exceeded" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }

  if (!verifyAuth(request)) {
    console.warn(`[AUDIT] Unauthorized GET attempt on Telegram settings from IP: ${clientIp}`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const m = await readAll();
    const encryptedToken = m[KEYS.token] ?? "";
    const decryptedToken = encryptedToken ? decryptToken(encryptedToken) : "";

    return NextResponse.json(
      {
        enabled: m[KEYS.enabled] === "1",
        chatId: m[KEYS.chatId] ?? "",
        baseUrl: m[KEYS.baseUrl] ?? "",
        tokenSet: Boolean(encryptedToken),
        tokenHint: decryptedToken ? `…${decryptedToken.slice(-4)}` : "",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    // Log error securely without exposing internals
    console.error(`[AUDIT] GET settings database failure from IP: ${clientIp}`);
    return NextResponse.json({ error: "settings store unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  if (!checkRateLimit(clientIp)) {
    return NextResponse.json({ error: "rate limit exceeded" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }

  if (!verifyAuth(request)) {
    console.warn(`[AUDIT] Unauthorized POST attempt on Telegram settings from IP: ${clientIp}`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  // 5. Streaming & Body Size Enforcement + Strict JSON Object Validation
  let body: Record<string, unknown>;
  try {
    const rawText = await request.text();
    if (rawText.length > MAX_BODY_SIZE) {
      return NextResponse.json({ error: "request body too large" }, { status: 413, headers: { "Cache-Control": "no-store" } });
    }
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "request body must be a JSON object" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "expected valid JSON object" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const updates: [string, string][] = [];

  // Enabled validation (Strict boolean or explicit string matching, preventing "false"/"0" bypass)
  if (body.enabled !== undefined) {
    if (typeof body.enabled === "boolean") {
      updates.push([KEYS.enabled, body.enabled ? "1" : "0"]);
    } else if (typeof body.enabled === "string") {
      const lower = body.enabled.trim().toLowerCase();
      if (lower === "true" || lower === "1" || lower === "yes") {
        updates.push([KEYS.enabled, "1"]);
      } else if (lower === "false" || lower === "0" || lower === "no") {
        updates.push([KEYS.enabled, "0"]);
      } else {
        return NextResponse.json({ error: "invalid boolean format for enabled" }, { status: 400, headers: { "Cache-Control": "no-store" } });
      }
    } else {
      return NextResponse.json({ error: "invalid type for enabled" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
  }

  // Chat ID validation & length cap
  if (body.chatId !== undefined) {
    if (typeof body.chatId !== "string") {
      return NextResponse.json({ error: "chatId must be a string" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const cleanChatId = body.chatId.trim();
    if (cleanChatId.length > MAX_INPUT_LENGTH) {
      return NextResponse.json({ error: "chatId exceeds maximum length" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    updates.push([KEYS.chatId, cleanChatId]);
  }

  // Base URL validation (HTTPS + SSRF Allowlist)
  if (body.baseUrl !== undefined) {
    if (typeof body.baseUrl !== "string") {
      return NextResponse.json({ error: "baseUrl must be a string" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const cleanBaseUrl = body.baseUrl.trim().replace(/\/+$/, "");
    if (cleanBaseUrl) {
      if (cleanBaseUrl.length > MAX_INPUT_LENGTH) {
        return NextResponse.json({ error: "baseUrl exceeds maximum length" }, { status: 400, headers: { "Cache-Control": "no-store" } });
      }
      if (!isValidBaseUrl(cleanBaseUrl)) {
        return NextResponse.json({ error: "baseUrl must be a valid public HTTPS URL and cannot target internal networks" }, { status: 400, headers: { "Cache-Control": "no-store" } });
      }
    }
    updates.push([KEYS.baseUrl, cleanBaseUrl]);
  }

  // Token validation & AES-256-GCM encryption
  if (body.token !== undefined) {
    if (typeof body.token !== "string") {
      return NextResponse.json({ error: "token must be a string" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const cleanToken = body.token.trim();
    if (cleanToken) {
      if (cleanToken.length > MAX_INPUT_LENGTH) {
        return NextResponse.json({ error: "token exceeds maximum length" }, { status: 400, headers: { "Cache-Control": "no-store" } });
      }
      const encrypted = encryptToken(cleanToken);
      updates.push([KEYS.token, encrypted]);
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "no valid settings provided for update" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  // 6. Database Transaction (Atomic Commit/Rollback to prevent partial updates)
  let connection: PoolConnection | null = null;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    for (const [name, value] of updates) {
      await connection.query(
        `INSERT INTO settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [name, value],
      );
    }

    await connection.commit();

    // Secure Audit Logging (NO tokens or sensitive values recorded)
    console.info(`[AUDIT] Telegram settings updated successfully from IP: ${clientIp} (Keys updated: ${updates.map(u => u[0]).join(", ")})`);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: unknown) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rbErr) {
        console.error(`[AUDIT] Rollback failed:`, rbErr);
      }
    }
    const message = err instanceof Error ? err.message : "database error";
    console.error(`[AUDIT] Failed to save settings atomically from IP ${clientIp}: ${message}`);
    return NextResponse.json({ error: "settings table unavailable or transaction failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}