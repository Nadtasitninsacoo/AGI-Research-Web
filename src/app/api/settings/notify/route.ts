import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

// Telegram notification settings. The bot token is write-only over the API: GET
// never returns it (only whether it is set + a short hint), so it is not exposed
// to the browser. Changing the receiving account = update chat id (and optionally
// token) here; the engine reads these live.

const KEYS = {
  enabled: "notify_telegram_enabled",
  token: "notify_telegram_token",
  chatId: "notify_telegram_chat_id",
  baseUrl: "notify_app_base_url",
} as const;

async function readAll(): Promise<Record<string, string>> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT name, value FROM settings WHERE name IN (?, ?, ?, ?)`,
    [KEYS.enabled, KEYS.token, KEYS.chatId, KEYS.baseUrl],
  );
  return Object.fromEntries(rows.map((r) => [String(r.name), String(r.value ?? "")]));
}

async function put(name: string, value: string) {
  await db.query(
    `INSERT INTO settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [name, value],
  );
}

export async function GET() {
  try {
    const m = await readAll();
    const token = m[KEYS.token] ?? "";
    return NextResponse.json({
      enabled: /^(1|true|yes)$/i.test(m[KEYS.enabled] ?? ""),
      chatId: m[KEYS.chatId] ?? "",
      baseUrl: m[KEYS.baseUrl] ?? "",
      tokenSet: Boolean(token),
      tokenHint: token ? `…${token.slice(-4)}` : "",
    });
  } catch {
    return NextResponse.json({ enabled: false, chatId: "", baseUrl: "", tokenSet: false, tokenHint: "", unavailable: true });
  }
}

export async function POST(request: Request) {
  let body: { enabled?: unknown; token?: unknown; chatId?: unknown; baseUrl?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }
  try {
    if (typeof body.enabled === "boolean") await put(KEYS.enabled, body.enabled ? "1" : "0");
    if (typeof body.chatId === "string") await put(KEYS.chatId, body.chatId.trim());
    if (typeof body.baseUrl === "string") await put(KEYS.baseUrl, body.baseUrl.trim().replace(/\/+$/, ""));
    // Only overwrite the token when a non-empty new one is provided (so you can
    // change the chat id without re-typing the token).
    if (typeof body.token === "string" && body.token.trim()) await put(KEYS.token, body.token.trim());
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "settings table unavailable; run DB init first" }, { status: 503 });
  }
}
