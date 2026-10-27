import fs from "node:fs";
import path from "node:path";
import type { ToolCall, Verdict } from "./types.js";

/** auto = decided by policy alone; the rest record what the user (or repeat guard) decided on an "ask". */
export type Outcome = "auto" | "user-allow" | "user-deny" | "repeat-deny" | "deferred";

const MAX_INPUT_CHARS = 1000;

/** Append-only JSONL record of every permission decision. */
export class AuditLog {
  readonly file: string;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "permissions.jsonl");
  }

  record(call: ToolCall, verdict: Verdict, outcome: Outcome): void {
    let input = JSON.stringify(call.input);
    if (input.length > MAX_INPUT_CHARS) input = input.slice(0, MAX_INPUT_CHARS) + "…";
    const line = { ts: new Date().toISOString(), tool: call.tool, input, ...verdict, outcome };
    fs.appendFileSync(this.file, JSON.stringify(line) + "\n");
  }
}
