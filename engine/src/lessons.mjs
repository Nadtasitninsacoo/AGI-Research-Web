// Cross-run learning for HYDRA. After a run, a concise "lesson" (the main problem
// or limitation hit, and how to handle it next time) is stored. Before planning —
// and again when re-planning after a dead-end — relevant past lessons are recalled
// and fed into the team's prompt, so the team reuses what worked and respects the
// limits it already discovered. All DB access is fail-closed: no lessons table,
// no error — the run just proceeds without memory.
import { query, execute } from "./db.mjs";

const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "your", "into", "over", "run", "task",
  "find", "check", "scan", "test", "all", "any", "use", "via", "get", "set", "เป็น", "และ", "ของ", "ให้", "ไป", "มา",
]);

/** Keyword tags from a free-text objective (English words 3+ chars or Thai runs 2+). */
export function extractTags(text, max = 8) {
  const words = String(text ?? "").toLowerCase().match(/[a-z0-9]{3,}|[฀-๿]{2,}/g) ?? [];
  const seen = new Set();
  const out = [];
  for (const w of words) {
    if (STOP.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

/** Render recalled lessons for a planning / re-planning prompt. Empty string when none. */
export function renderLessons(lessons) {
  if (!Array.isArray(lessons) || !lessons.length) return "";
  const lines = lessons.map((l) => `- ${l.problem ? `when ${l.problem}: ` : ""}${l.solution}`);
  return (
    `\n\nLessons from past runs (apply what worked; do not repeat known mistakes; respect known limitations):\n` +
    lines.join("\n")
  );
}

/** Store one lesson. No-op on empty solution or a missing table. */
export async function recordLesson({ kind = "retrospective", tags = "", problem = null, solution, runId = null }) {
  const sol = typeof solution === "string" ? solution.trim() : "";
  if (!sol) return;
  try {
    await execute(
      `INSERT INTO lessons (kind, tags, problem, solution, run_id) VALUES (?, ?, ?, ?, ?)`,
      [String(kind).slice(0, 20), String(tags).slice(0, 255), problem ? String(problem).slice(0, 2000) : null, sol.slice(0, 4000), runId],
    );
  } catch {
    /* fail-closed: learning is best-effort */
  }
}

/** Recall lessons relevant to an objective (keyword match), newest first. */
export async function recallLessons(objective, limit = 5) {
  const tags = extractTags(objective);
  try {
    if (!tags.length) {
      return await query(`SELECT kind, problem, solution FROM lessons ORDER BY id DESC LIMIT ?`, [limit]);
    }
    const where = tags.map(() => `tags LIKE ?`).join(" OR ");
    const params = [...tags.map((t) => `%${t}%`), limit];
    return await query(`SELECT kind, problem, solution FROM lessons WHERE ${where} ORDER BY id DESC LIMIT ?`, params);
  } catch {
    return [];
  }
}
