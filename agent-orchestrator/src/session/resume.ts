import fs from "node:fs";
import type { ResolvedConfig } from "../config/load.js";
import type { Mode } from "../config/schema.js";
import { loadPrompt } from "./system-prompt.js";

const ACT: Record<Mode, string> = {
  approve:
    "   Present your plan as a short numbered list (continue / skip / needs-a-human) and STOP. Do not change any\n" +
    "   files or run anything that alters state until the user approves. Wait for their go-ahead.",
  auto:
    "   Carry out the 'continue' items yourself now, in a sensible order, verifying each as you go. Record any\n" +
    "   ask-level action you had to defer under “waiting on the user” in PROGRESS.md. Report what you did and\n" +
    "   what remains. You do not need to wait for the user to begin.",
};

/** There is unfinished work worth a resume pass: PROGRESS.md exists and has content. */
export function hasUnfinishedWork(cfg: ResolvedConfig): boolean {
  try {
    return fs.readFileSync(cfg.paths.progress, "utf8").trim().length > 0;
  } catch {
    return false;
  }
}

/** The first-turn instruction that drives the Sense → Assess → Decide → Act pass. */
export function resumePrompt(cfg: ResolvedConfig, mode: Mode): string {
  return loadPrompt(cfg, "resume", { mode, actInstruction: ACT[mode] });
}
