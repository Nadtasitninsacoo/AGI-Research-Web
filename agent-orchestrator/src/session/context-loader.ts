import fs from "node:fs";
import path from "node:path";
import type { ResolvedConfig } from "../config/load.js";
import type { Mode } from "../config/schema.js";
import { MemoryStore } from "../memory/store.js";

const MAX_FILE_CHARS = 8000;

function readMaybe(file: string): string | undefined {
  try {
    const text = fs.readFileSync(file, "utf8").trim();
    if (!text) return undefined;
    return text.length > MAX_FILE_CHARS ? text.slice(0, MAX_FILE_CHARS) + "\n…(truncated)" : text;
  } catch {
    return undefined;
  }
}

/**
 * Assembles the standing context prepended to the main agent's system prompt
 * at session start: current mode, project status, memory index and team rules.
 * These give the agent what it needs to answer "what's left?" and to resume
 * work without re-reading everything.
 */
export function loadContext(cfg: ResolvedConfig, mode: Mode): string {
  const sections: string[] = [`# Session context\n\nMode: **${mode}** — ${modeLine(mode)}`];

  const progress = readMaybe(cfg.paths.progress);
  sections.push(`## Project status (PROGRESS.md)\n\n${progress ?? "No PROGRESS.md yet. Create one as work starts."}`);

  const index = new MemoryStore(cfg.paths.memory).renderIndex();
  if (index) sections.push(`## Memory index\n\nRead a file before relying on it.\n\n${index}`);

  const agents = readMaybe(path.join(cfg.targetRepo, "AGENTS.md"));
  if (agents) sections.push(`## Team rules (AGENTS.md)\n\n${agents}`);

  return sections.join("\n\n");
}

function modeLine(mode: Mode): string {
  return mode === "auto"
    ? "proceed with unfinished work on your own; deny still blocks, and ask-level actions are deferred for a human, not self-approved."
    : "pause for the user before continuing unfinished work and at every ask-level action.";
}
