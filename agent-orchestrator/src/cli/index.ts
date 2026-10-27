import path from "node:path";
import { loadConfig } from "../config/load.js";
import { modeSchema } from "../config/schema.js";
import { createPermissionGate } from "../permissions/index.js";
import { MainSession } from "../session/main-session.js";
import { hasUnfinishedWork, resumePrompt } from "../session/resume.js";
import { RuntimeState } from "../state/runtime-state.js";
import { newRunId } from "../util/run-id.js";
import { PermissionPrompter } from "./permission-prompt.js";
import { cyan, dim, red, summarize, Terminal } from "./terminal.js";

const cfg = await loadConfig();
const state = new RuntimeState(cfg.paths.state, { mode: cfg.mode, outboundBlocked: cfg.security.blockExternalUrls });
const logDir = path.join(cfg.paths.logs, newRunId());

const term = new Terminal();
let busy = false;
const chatPrompt = () => term.setPrompt(busy ? dim("[agent กำลังทำงาน] ") + "> " : "> ");
const prompter = new PermissionPrompter(term, chatPrompt);
const gate = createPermissionGate(cfg, {
  ask: prompter.ask,
  getMode: () => state.mode,
  getOutboundBlocked: () => state.outboundBlocked,
  logDir,
});

const session = new MainSession(cfg, gate, state.mode, {
  onText: (text) => term.print(cyan("agent: ") + text),
  onToolUse: (name, input) => term.print(dim(`  · ${name} ${summarize(input)}`)),
  onTurnEnd: ({ costUsd, error }) => {
    if (error) term.print(red(`  ! ${error}`));
    term.print(dim(`  (cost so far $${costUsd.toFixed(4)})`));
  },
  onBusyChange: (b) => {
    busy = b;
    if (!prompter.open) chatPrompt();
  },
  onJobFinished: (r) => term.print(dim(`  ⬢ job ${r.id} ${r.status} ($${r.costUsd.toFixed(4)})`)),
});

console.log(dim(`target repo: ${cfg.targetRepo}`));
const outboundLabel = () => (state.outboundBlocked ? "blocked" : "ask");
console.log(dim(`model: ${cfg.models.main} · mode: ${state.mode} · outbound: ${outboundLabel()} · log: ${gate.audit.file}`));
console.log(dim("คำสั่ง: /mode [auto|approve] · /outbound [block|allow] · /resume · /exit"));
chatPrompt();

/** Kick off the Sense→Assess→Decide→Act pass over unfinished work. */
function startResume(): void {
  term.print(dim("  ↻ กำลังประเมินงานค้าง (resume)…"));
  session.send(resumePrompt(cfg, state.mode));
}
if (cfg.resume.onStart && hasUnfinishedWork(cfg)) startResume();

term.rl.on("line", (line) => {
  if (prompter.answer(line)) return;
  const text = line.trim();
  if (!text) return chatPrompt();
  if (text === "/exit") return shutdown();
  if (text === "/resume") return (startResume(), chatPrompt());
  if (text.startsWith("/mode")) return handleMode(text.slice(5).trim());
  if (text.startsWith("/outbound")) return handleOutbound(text.slice(9).trim());
  session.send(text);
  chatPrompt();
});
term.rl.on("close", shutdown);

/** /mode shows the current mode; /mode auto|approve changes it and persists the choice. */
function handleMode(arg: string): void {
  if (!arg) {
    term.print(dim(`mode: ${state.mode} (คงอยู่ข้ามการรีสตาร์ท จนกว่าจะเปลี่ยนเอง)`));
    return chatPrompt();
  }
  const parsed = modeSchema.safeParse(arg);
  if (!parsed.success) {
    term.print(red("ใช้: /mode auto หรือ /mode approve"));
    return chatPrompt();
  }
  state.setMode(parsed.data);
  term.print(dim(`mode → ${parsed.data} (บันทึกแล้ว)`));
  // Tell the running agent, so it adapts without restarting the session.
  session.inbox.push(`[system] The operator switched the mode to "${parsed.data}". Follow that mode from now on.`, { synthetic: true });
  chatPrompt();
}

/** /outbound shows the switch; block|allow flips the admin kill switch and persists it. */
function handleOutbound(arg: string): void {
  if (arg === "block" || arg === "allow") {
    state.setOutboundBlocked(arg === "block");
    term.print(dim(`outbound → ${outboundLabel()} (บันทึกแล้ว)`));
  } else if (!arg || arg === "status") {
    term.print(dim(`outbound: ${outboundLabel()} — block = ห้ามออก URL ภายนอกเด็ดขาด, allow = ถามก่อน (auto จะพักไว้)`));
  } else {
    term.print(red("ใช้: /outbound block หรือ /outbound allow"));
  }
  chatPrompt();
}

function shutdown(): void {
  session.close();
  term.rl.close();
  process.exit(0);
}

session.run().catch((err: unknown) => {
  term.print(red(`agent stopped: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
