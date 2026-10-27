// Normalize a model-produced shell command before it is checked and run.
// Fixes recurring issues seen in real logs:
//   - the model wraps a URL as a Markdown link: `[http://x](http://x)` -> `http://x`
//   - a URL wrapped in angle brackets: `<http://x>` -> `http://x`
//   - on Windows PowerShell, bare `curl`/`wget` are aliases of Invoke-WebRequest
//     with different flags (so `curl -s URL` fails); rewrite to the real binaries.
//
// Pure, no I/O, unit-testable.

const MD_LINK = /\[([^\]]*)\]\(\s*([^)]+?)\s*\)/g;
const isUrl = (s) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s);

/** Replace `[label](target)` with the URL target (or the label if the target is not a URL). */
export function stripMarkdownLinks(command) {
  return command.replace(MD_LINK, (_, label, target) => {
    const t = target.trim();
    return isUrl(t) ? t : label.trim() || t;
  });
}

/** Unwrap `<http://...>` to the bare URL. */
export function stripAngleUrls(command) {
  return command.replace(/<\s*(https?:\/\/[^>\s]+)\s*>/gi, "$1");
}

/**
 * On PowerShell, `curl`/`wget` are aliases of Invoke-WebRequest with different
 * flags. Rewrite them to the real `curl.exe`/`wget.exe` so Linux-style flags work.
 */
export function fixWindowsHttpAlias(command, shell) {
  if (shell !== "powershell") return command;
  return command.replace(/(^|[;&|]\s*)(curl|wget)(\s)/gi, (_, pre, tool, sp) => `${pre}${tool.toLowerCase()}.exe${sp}`);
}

export function normalizeCommand(command, shell) {
  let c = String(command ?? "");
  c = stripMarkdownLinks(c);
  c = stripAngleUrls(c);
  c = fixWindowsHttpAlias(c, shell);
  return c.trim();
}
