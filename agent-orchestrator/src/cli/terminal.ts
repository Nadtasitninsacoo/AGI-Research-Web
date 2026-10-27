import readline from "node:readline";

export const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
export const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
export const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
export const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

/** One-line view of a tool input: the command or path, cut to `max` chars. */
export function summarize(input: unknown, max = 120): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  const v = String(o.command ?? o.file_path ?? o.pattern ?? o.path ?? "").replace(/\s+/g, " ");
  return v.length > max ? v.slice(0, max) + "…" : v;
}

/** readline wrapper that prints above the input line without clobbering what the user is typing. */
export class Terminal {
  readonly rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  private promptText = "> ";

  print(line: string): void {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    console.log(line);
    this.rl.setPrompt(this.promptText);
    this.rl.prompt(true);
  }

  setPrompt(text: string): void {
    this.promptText = text;
    this.rl.setPrompt(text);
    this.rl.prompt(true);
  }
}
