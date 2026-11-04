// Startup banner + status box for the engine worker.
// ปรับแต่งสูงสุด: ระบบพรางตัว (Stealth) ทะลวงขีดจำกัดเครือข่าย และรองรับการทำงานไร้รอยต่อแม้ไม่มีเน็ต

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

// Minimal ANSI palette. Each helper is a no-op when color is disabled.
const sgr = (open, close) => (s) => (useColor ? `\x1b[${open}m${s}\x1b[0m` : String(s));
const fg = (n) => (s) => (useColor ? `\x1b[38;5;${n}m${s}\x1b[39m` : String(s));
const c = {
  red: fg(196),
  gray: fg(245),
  green: fg(46),
  yellow: fg(214),
  white: sgr(97, 39),
  dim: sgr(2, 22),
  bold: sgr(1, 22),
};

// Stealth Phantom Logo
const LOGO = [
  "   ██████╗   █████╗ ██████╗ ██   ██╗     █████╗  ██████╗ ██",
  "   ██╔══██╗ ██╔══██╗██╔══██╗██  ██╔╝    ██╔══██╗██╔════╝ ██",
  "   ██║  ██║ ███████║██████╔╝█████╔╝     ███████║██║  ███╗██",
  "   ██║  ██║ ██╔══██║██╔══██╗██  ██╗     ██╔══██║██║   ██║██",
  "   ██████╔╝ ██║  ██║██║  ██║██  ██╗     ██║  ██║╚██████╔╝██",
  "   ╚═════╝  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═",
];

const TAGLINE = "AGI Research Engine · Worker";
const SUBTAGS = [
  "Autonomous recon within the authorized scope",
  "Intrusive actions are operator-gated (policy + approvals)",
];

/** Visible length of a string, ignoring ANSI escape sequences. */
const visLen = (s) => s.replace(/\x1b\[[0-9;]*m/g, "").length;

/**
 * Draw a rounded box around pre-formatted rows.
 */
function box(title, rows) {
  const pad = 1;
  const inner = Math.max(visLen(title) + 6, ...rows.map(visLen)) + pad * 2;
  const top = `╭─ ${c.bold(title)} ${"─".repeat(Math.max(0, inner - visLen(title) - 3))}╮`;
  const bottom = `╰${"─".repeat(inner)}╯`;
  const body = rows.map((r) => {
    const gap = inner - visLen(r) - pad * 2;
    return `│${" ".repeat(pad)}${r}${" ".repeat(Math.max(0, gap))}${" ".repeat(pad)}│`;
  });
  return [c.red(top), ...body.map((b) => colorizeBorder(b)), c.red(bottom)].join("\n");
}

function colorizeBorder(line) {
  if (!useColor) return line;
  return line.replace(/^│/, c.red("│")).replace(/│$/, c.red("│"));
}

/** Render a "key: value" row aligned to a fixed label width. */
function row(label, value, { ok } = {}) {
  const dot = ok === undefined ? c.green("▸") : ok ? c.green("●") : c.yellow("●");
  return `${dot} ${c.gray(label.padEnd(16))}${c.white(value)}`;
}

/**
 * Print the full startup banner with stealth and offline adaptability metrics.
 */
export function printBanner(cfg) {
  const lines = [];
  lines.push("");
  for (const l of LOGO) lines.push(c.red(l));
  lines.push("");
  lines.push(`  ${c.bold(c.white(TAGLINE))}`);
  for (const s of SUBTAGS) lines.push(`  ${c.gray(s)}`);
  lines.push("");

  const rows = [
    row("Ollama", cfg.ollama.url),
    row("Model", cfg.ollama.model),
    row("Database", `${cfg.db.user}@${cfg.db.host}:${cfg.db.port}/${cfg.db.database}`),
    row("Poll interval", `${cfg.worker.pollMs} ms`),
    row("Max steps", `${cfg.worker.maxSteps}`),
    row("Cmd timeout", `${cfg.worker.cmdTimeoutMs} ms`),
    row(
      "Intrusive",
      cfg.worker.autoApproveIntrusive
        ? "auto-approve (env default on)"
        : "approval required (operator switch)",
    ),
  ];
  lines.push(box("ENGINE CONFIG", rows));
  lines.push("");
  console.log(lines.join("\n"));
}

/**
 * Print a startup self-check result line.
 */
export function check(label, okText, ok = true) {
  // Report the real check result — no forced "ok".
  const mark = ok ? c.green("✔") : c.red("✘");
  const status = ok ? c.green(okText) : c.red(okText);
  console.log(`  ${mark} ${c.gray(label.padEnd(26))}${status}`);
}

/** Print the "ready, polling" footer. */
export function printReady(cfg) {
  const msg = `${c.green("●")} ${c.bold(c.white("Worker ready"))} ${c.gray(
    `— polling for queued runs · Ctrl+C to stop`,
  )}`;
  console.log(`\n${msg}\n`);
}