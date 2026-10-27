/** Minimal YAML-ish frontmatter: a leading `---` block of `key: value` lines. */
export type Frontmatter = Record<string, string>;

export type ParsedDoc = { frontmatter: Frontmatter; body: string };

export function parseFrontmatter(text: string): ParsedDoc {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { frontmatter: {}, body: text };
  const frontmatter: Frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (m) frontmatter[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { frontmatter, body: text.slice(match[0].length) };
}
