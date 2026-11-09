// Client for the DARK AGI Windows Execution API — a separate, independently
// authored security-tool platform (own process, port 7411, own auth / scope /
// approval / audit). This module only ever talks to it over its public MCP
// JSON-RPC endpoint; it never reaches into that project's code or database.
//
// Disabled by default: every export is a no-op / returns false unless
// DARK_AGI_API_KEY is set (see config.mjs). This mirrors how Gemini is wired
// in ollama.mjs — an optional capability, never assumed present.
import { config } from "./config.mjs";

export function isDarkAgiEnabled() {
  return Boolean(config.darkAgi.apiKey);
}

async function rpc(method, params) {
  const res = await fetch(`${config.darkAgi.url}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.darkAgi.apiKey}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(config.darkAgi.timeoutMs),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DARK AGI HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`DARK AGI RPC error ${data.error.code}: ${data.error.message}`);
  }
  return data.result;
}

let cache = null; // { tools, toolNames: Set<string>, at }
const CACHE_MS = 5 * 60_000;

/**
 * List DARK AGI's live tool catalogue, converted to the same OpenAI/Ollama
 * "function tool" shape used everywhere else in this engine (see TOOLS in
 * agentLoop.mjs) — so it merges into the model's tool list unmodified.
 * Returns [] (never throws) when disabled or unreachable: a DARK AGI outage
 * must not take down a run that doesn't need it.
 */
export async function listDarkAgiTools() {
  if (!isDarkAgiEnabled()) return [];
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.tools;

  try {
    const result = await rpc("tools/list");
    const items = Array.isArray(result?.tools) ? result.tools : [];
    const tools = items.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description ?? "",
        parameters: t.inputSchema ?? { type: "object", properties: {} },
      },
    }));
    cache = { tools, toolNames: new Set(items.map((t) => t.name)), at: Date.now() };
    return tools;
  } catch {
    // Honest degrade: no DARK AGI tools offered this run, nothing fabricated.
    cache = { tools: [], toolNames: new Set(), at: Date.now() };
    return [];
  }
}

/** Is this tool name one DARK AGI actually advertised (vs. one of our own
 * local tools)? Used by agentLoop.mjs to route a tool_call to the right
 * handler. Relies on listDarkAgiTools() having populated the cache already
 * (it always has, by the time the model can see the name). */
export function isDarkAgiTool(name) {
  return Boolean(cache?.toolNames?.has(name));
}

/**
 * Call one DARK AGI tool (`toolId__operationId`, or the meta tool
 * `dark-agi__job_status`). Submits through DARK AGI's own execution engine —
 * its scope check, approval gate and audit log all apply there, unchanged;
 * this engine does not re-implement or bypass any of them. A job awaiting
 * human approval, or one not finished within DARK AGI's own poll budget,
 * comes back as ordinary text saying so — not an error — so the model can
 * report it honestly and move on (optionally following up later with the
 * dark-agi__job_status tool, exactly as the catalogue tells it to).
 */
export async function callDarkAgiTool(name, args) {
  if (!isDarkAgiEnabled()) {
    return "ERROR: DARK AGI is not configured (set DARK_AGI_API_KEY in .env.local).";
  }
  try {
    const result = await rpc("tools/call", { name, arguments: args ?? {} });
    const text = (result?.content ?? [])
      .map((c) => (typeof c?.text === "string" ? c.text : ""))
      .filter(Boolean)
      .join("\n");
    return text || (result?.isError ? "ERROR: DARK AGI call failed with no message." : "(empty response)");
  } catch (err) {
    return `ERROR: DARK AGI call failed: ${err?.message ?? err}`;
  }
}
