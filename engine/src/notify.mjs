// Outbound notifications (Telegram). One-way push only — the engine sends a
// message when a run finishes or an approval is needed; it never receives (no
// webhook). Approval messages carry a LINK to the web approval page. Config lives
// in `settings` (edited from the web), read live so changing the account/token
// takes effect without restarting. Everything here is fail-safe.
import { query } from "./db.mjs";

/** Read Telegram config from settings. Never throws. */
async function cfg() {
  try {
    const rows = await query(
      `SELECT name, value FROM settings WHERE name IN
         ('notify_telegram_enabled','notify_telegram_token','notify_telegram_chat_id','notify_app_base_url')`,
    );
    const m = Object.fromEntries((rows ?? []).map((r) => [r.name, r.value]));
    return {
      enabled: /^(1|true|yes)$/i.test(String(m.notify_telegram_enabled ?? "")),
      token: String(m.notify_telegram_token ?? "").trim(),
      chatId: String(m.notify_telegram_chat_id ?? "").trim(),
      baseUrl: String(m.notify_app_base_url ?? "").trim().replace(/\/+$/, ""),
    };
  } catch {
    return { enabled: false, token: "", chatId: "", baseUrl: "" };
  }
}

const esc = (s) =>
  String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);

/** POST a message to Telegram. Returns true on success. Never throws. */
async function send(c, text, buttons) {
  if (!c.enabled || !c.token || !c.chatId) return false;
  try {
    const body = { chat_id: c.chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
    if (buttons?.length) body.reply_markup = { inline_keyboard: [buttons.map((b) => ({ text: b.text, url: b.url }))] };
    const res = await fetch(`https://api.telegram.org/bot${c.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Notify that a run finished (succeeded / failed / needs_input). */
export async function notifyRunFinished({ runId, status, experiment, agent, summary }) {
  const c = await cfg();
  if (!c.enabled) return false;
  const icon = status === "succeeded" ? "✅" : status === "failed" ? "❌" : status === "needs_input" ? "⏸️" : "ℹ️";
  const lines = [
    `${icon} <b>Run #${runId} — ${esc(status)}</b>`,
    `experiment: ${esc(experiment ?? "—")}`,
    `agent: ${esc(agent ?? "—")}`,
  ];
  if (summary) lines.push("", esc(String(summary).slice(0, 300)));
  const buttons = c.baseUrl ? [{ text: "เปิดดู run", url: `${c.baseUrl}/runs/${runId}` }] : undefined;
  return send(c, lines.join("\n"), buttons);
}

/** Notify that an intrusive command needs operator approval (links to the web). */
export async function notifyApprovalNeeded({ command, reason, tier }) {
  const c = await cfg();
  if (!c.enabled) return false;
  const lines = [
    `🔐 <b>ต้องการอนุมัติ</b> [${esc(tier ?? "intrusive")}]`,
    `<code>${esc(String(command).slice(0, 400))}</code>`,
  ];
  if (reason) lines.push(esc(String(reason).slice(0, 300)));
  const buttons = c.baseUrl ? [{ text: "✅ ไปอนุมัติบนเว็บ", url: `${c.baseUrl}/command` }] : undefined;
  return send(c, lines.join("\n"), buttons);
}
