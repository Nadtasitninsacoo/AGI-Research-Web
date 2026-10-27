// Startup banner + status box for the engine worker.
//
// Pure Node, no dependencies. Prints a red-themed ASCII logo and a boxed
// summary of the live configuration, plus one-line "check" rows for the
// startup self-tests (DB, Ollama). Colors are disabled automatically when
// stdout is not a TTY or when NO_COLOR is set, so piped logs stay clean.

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

// Minimal ANSI palette. Each helper is a no-op when color is disabled.
const sgr = (open, close) => (s) => (useColor ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
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

// ANSI-Shadow style art for "AGI".
const LOGO = [
  "   █████╗  ██████╗ ██╗",
  "  ██╔══██╗██╔════╝ ██║",
  "  ███████║██║  ███╗██║",
  "  ██╔══██║██║   ██║██║",
  "  ██║  ██║╚██████╔╝██║",
  "  ╚═╝  ╚═╝ ╚═════╝ ╚═╝",
];

const TAGLINE = "RESEARCH ENGINE  ·  autonomous run worker";
const SUBTAGS = [
  "AI-driven recon · analysis · reporting pipeline",
  "authorized engagements only — scope-gated execution",
];

/** Visible length of a string, ignoring ANSI escape sequences. */
const visLen = (s) => s.replace(/\x1b\[[0-9;]*m/g, "").length;

/**
 * Draw a rounded box around pre-formatted rows.
 * @param {string} title  short label shown in the top border
 * @param {string[]} rows already-colored content lines
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

// Recolor just the leading/trailing border glyphs red without touching content.
function colorizeBorder(line) {
  if (!useColor) return line;
  return line.replace(/^│/, c.red("│")).replace(/│$/, c.red("│"));
}

/** Render a "key: value" row aligned to a fixed label width. */
function row(label, value, { ok } = {}) {
  const dot = ok === undefined ? c.red("▸") : ok ? c.green("●") : c.yellow("●");
  return `${dot} ${c.gray(label.padEnd(16))}${c.white(value)}`;
}

/**
 * Print the full startup banner.
 * @param {object} cfg  the engine config object
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
    row("Max steps", String(cfg.worker.maxSteps)),
    row("Cmd timeout", `${cfg.worker.cmdTimeoutMs} ms`),
    row(
      "Intrusive",
      cfg.worker.autoApproveIntrusive ? "AUTO-APPROVED (!)" : "requires approval token",
    ),
  ];
  lines.push(box("ENGINE CONFIG", rows));
  lines.push("");
  console.log(lines.join("\n"));
}

/**
 * Print a startup self-check result line, e.g.
 *   ✔ MySQL connection         reachable
 *   ✘ Ollama model             not found
 */
export function check(label, okText, ok = true) {
  const mark = ok ? c.green("✔") : c.red("✘");
  const status = ok ? c.green(okText) : c.red(okText);
  console.log(`  ${mark} ${c.gray(label.padEnd(26))}${status}`);
}

/** Print the "ready, polling" footer once startup checks pass. */
export function printReady(cfg) {
  const msg = `${c.green("●")} ${c.bold(c.white("Worker ready"))} ${c.gray(
    `— polling every ${cfg.worker.pollMs} ms · Ctrl+C to stop`,
  )}`;
  console.log(`\n${msg}\n`);
}
