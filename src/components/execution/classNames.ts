/** Page-scoped class names: s.panel -> "ex-panel" (styles in app/execute/execute.css). */
export const s = new Proxy({} as Record<string, string>, {
  get: (_, key) => `ex-${String(key)}`,
});
