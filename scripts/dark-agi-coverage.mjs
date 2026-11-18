// Generates docs/DARK_AGI_COVERAGE.md from the LIVE DARK AGI catalogue
// (GET /operations) — nothing here is a hard-coded operation list, so new
// operations on the DARK AGI side show up on the next run.
//
// Usage: node --env-file=.env.local scripts/dark-agi-coverage.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const base = (process.env.DARK_AGI_URL?.trim() || "http://127.0.0.1:7411/api/v1").replace(/\/+$/, "");
const key = process.env.DARK_AGI_API_KEY?.trim();
if (!key) {
  console.error("DARK_AGI_API_KEY missing (use --env-file=.env.local)");
  process.exit(1);
}

const res = await fetch(`${base}/operations`, { headers: { Authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(`GET /operations -> ${res.status}`);
  process.exit(1);
}
const body = await res.json();
const ops = Array.isArray(body) ? body : body.items;

const CRED_TOOLS = new Set(["misp", "virustotal-api", "nasa-neows"]);
const hasField = (o, t) => o.fields.some((f) => f.type === t);

function launch(o) {
  if (!o.available) return "ติดตั้ง tool ก่อน";
  if (hasField(o, "remoteHost")) return "Terminal (ต้องมี Remote Host อนุมัติ)";
  if (CRED_TOOLS.has(o.toolId)) return "Terminal (ต้องตั้ง credential — ยังไม่มี UI)";
  return "Terminal / รันทันที";
}

const byCat = new Map();
for (const o of ops) {
  if (!byCat.has(o.category)) byCat.set(o.category, []);
  byCat.get(o.category).push(o);
}

const lines = [
  "# DARK AGI operation coverage",
  "",
  `Generated ${new Date().toISOString()} from \`GET /operations\` — ${ops.length} operations, ${ops.filter((o) => o.available).length} available on this host.`,
  "",
  "`available` = the tool is installed on the DARK AGI host. An unavailable operation cannot run no matter what the console does; the reason is shown.",
  "",
];
for (const [cat, list] of [...byCat].sort()) {
  lines.push(`## ${cat} (${list.length})`, "", "| operation | kind | approval | available | launch path |", "|---|---|---|---|---|");
  for (const o of list.sort((a, b) => `${a.toolId}:${a.operationId}`.localeCompare(`${b.toolId}:${b.operationId}`))) {
    lines.push(
      `| \`${o.toolId}:${o.operationId}\` | ${o.targetKind} | ${o.requiresApproval ? "yes" : "no"} | ${o.available ? "yes" : `no — ${o.unavailableReason ?? "?"}`} | ${launch(o)} |`,
    );
  }
  lines.push("");
}
mkdirSync("docs", { recursive: true });
writeFileSync("docs/DARK_AGI_COVERAGE.md", lines.join("\n"));
console.log(`wrote docs/DARK_AGI_COVERAGE.md (${ops.length} ops)`);
