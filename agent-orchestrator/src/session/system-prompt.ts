import fs from "node:fs";
import path from "node:path";
import type { ResolvedConfig } from "../config/load.js";

/** Load `prompts/<name>.md` and fill `{{placeholders}}`. Unknown placeholders are an error, not a silent blank. */
export function loadPrompt(cfg: ResolvedConfig, name: string, vars: Record<string, string> = {}): string {
  const file = path.join(cfg.paths.prompts, `${name}.md`);
  const all: Record<string, string> = { targetRepo: cfg.targetRepo, ...vars };
  return fs.readFileSync(file, "utf8").replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in all)) throw new Error(`${file}: unknown placeholder {{${key}}}`);
    return all[key];
  });
}
