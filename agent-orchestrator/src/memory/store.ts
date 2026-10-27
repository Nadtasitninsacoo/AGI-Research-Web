import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter.js";

export const MEMORY_TYPES = ["user", "feedback", "project", "reference"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export type MemoryEntry = { name: string; description: string; type: MemoryType; file: string };

function isType(v: string): v is MemoryType {
  return (MEMORY_TYPES as readonly string[]).includes(v);
}

/**
 * Reads the memory/ folder: one Markdown file per topic, each with
 * frontmatter (name, description, type). Malformed files are reported, not
 * thrown, so one bad file never blocks a session from starting.
 */
export class MemoryStore {
  constructor(private readonly dir: string) {}

  list(): { entries: MemoryEntry[]; problems: string[] } {
    const entries: MemoryEntry[] = [];
    const problems: string[] = [];
    for (const file of this.files()) {
      const { frontmatter: fm } = parseFrontmatter(fs.readFileSync(path.join(this.dir, file), "utf8"));
      const type = fm.type ?? "";
      if (!fm.name || !fm.description || !isType(type)) {
        problems.push(`${file}: needs name, description and type ∈ {${MEMORY_TYPES.join(", ")}}`);
        continue;
      }
      entries.push({ name: fm.name, description: fm.description, type, file });
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return { entries, problems };
  }

  /** One line per memory, grouped by type: the index loaded into context each session. */
  renderIndex(): string {
    const { entries } = this.list();
    if (!entries.length) return "";
    const lines = MEMORY_TYPES.flatMap((t) => {
      const group = entries.filter((e) => e.type === t);
      return group.length ? [`### ${t}`, ...group.map((e) => `- [${e.name}](${e.file}) — ${e.description}`)] : [];
    });
    return lines.join("\n");
  }

  private files(): string[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "index.md")
      .sort();
  }
}
