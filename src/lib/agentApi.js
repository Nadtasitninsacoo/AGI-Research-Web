export function resolveAgentApiBaseUrl(rawValue) {
  const normalized = (rawValue ?? "").trim();
  const resolved = normalized || "http://localhost:3001";
  return resolved.replace(/\/+$/, "");
}
