/** `2>&1`, `>/dev/null`, `2>nul` and similar: redirections that write no file. */
const HARMLESS_REDIRECT = /\d*>&\d+|&>\s*\/dev\/null|\d*>>?\s*\/dev\/null|\d*>>?\s*nul\b/gi;

/**
 * Split a shell command on control operators (`&&`, `||`, `;`, `|`, `&`, newline).
 * Deliberately quote-unaware: splitting too much only adds segments, and every
 * segment has to be allowed on its own, so errors fail toward asking.
 */
export function splitCommand(command: string): string[] {
  return command
    .replace(HARMLESS_REDIRECT, " ")
    .split(/&&|\|\||[;|&\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Effects the segment split cannot see: nested commands, or output written to a file. */
export function hiddenEffect(command: string): string | undefined {
  const s = command.replace(HARMLESS_REDIRECT, " ");
  if (/\$\(|`|<\(|>\(/.test(s)) return "command substitution";
  if (/>/.test(s)) return "output redirection to a file";
  return undefined;
}

/** Whitespace tokens with surrounding quotes removed. */
export function tokens(segment: string): string[] {
  return segment
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/^["']+|["']+$/g, ""));
}
