import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

// Send a test Telegram message using the saved settings, so the operator can
// confirm the token + chat id work before relying on it.

export async function POST() {
  let token = "";
  let chatId = "";
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT name, value FROM settings WHERE name IN ('notify_telegram_token','notify_telegram_chat_id')`,
    );
    const m = Object.fromEntries(rows.map((r) => [String(r.name), String(r.value ?? "")]));
    token = (m.notify_telegram_token ?? "").trim();
    chatId = (m.notify_telegram_chat_id ?? "").trim();
  } catch {
    return NextResponse.json({ error: "settings table unavailable" }, { status: 503 });
  }
  if (!token || !chatId) {
    return NextResponse.json({ error: "ยังไม่ได้ตั้ง token หรือ chat id — บันทึกก่อน" }, { status: 400 });
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: "✅ ทดสอบการแจ้งเตือนจาก AGI Research — ใช้งานได้แล้ว" }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const desc = (() => {
        try {
          return (JSON.parse(detail) as { description?: string }).description ?? "";
        } catch {
          return "";
        }
      })();
      return NextResponse.json({ error: `Telegram ปฏิเสธ: ${desc || res.status}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ส่งไม่สำเร็จ — ตรวจเน็ต/โทเคน" }, { status: 502 });
  }
}
