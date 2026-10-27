// Minimal Ollama chat client with tool-calling support.
// Uses the native fetch in Node 18+; no external HTTP dependency.
// API reference: POST {OLLAMA_URL}/api/chat  (stream disabled).
import { config } from "./config.mjs";

/**
 * Call the model once.
 * @param {object} p
 * @param {string} p.model
 * @param {Array<{role:string,content:string,tool_calls?:any[],name?:string}>} p.messages
 * @param {any[]} [p.tools]  OpenAI-style tool/function definitions
 * @returns {Promise<{message:any, promptTokens:number, outputTokens:number}>}
 */
/** Exponential backoff with full jitter, capped at 30s. Pure (exported for tests). */
export function backoffDelay(attempt, baseMs = config.ollama.retryBaseMs) {
  const ceiling = Math.min(baseMs * 2 ** attempt, 30_000);
  return Math.floor(Math.random() * ceiling);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One model call; throws {retryable} on timeout/network, non-retryable on HTTP error. */
async function chatOnce({ model, messages, tools }) {
  const body = {
    model: model || config.ollama.model,
    messages,
    stream: false,
    options: { temperature: config.ollama.temperature, num_predict: config.ollama.numPredict },
  };
  if (tools && tools.length) body.tools = tools;

  let res;
  try {
    res = await fetch(`${config.ollama.url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.ollama.timeoutMs),
    });
  } catch (err) {
    const e = new Error(`Ollama request failed (is it running at ${config.ollama.url}?): ${err?.message ?? err}`);
    e.retryable = true; // timeout / connection refused / DNS
    throw e;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const e = new Error(`Ollama returned HTTP ${res.status}: ${text.slice(0, 500)}`);
    // 5xx may be transient (model loading); 4xx is a client error, do not retry.
    e.retryable = res.status >= 500;
    throw e;
  }

  const data = await res.json();
  return {
    message: data.message ?? { role: "assistant", content: "" },
    promptTokens: Number(data.prompt_eval_count ?? 0),
    outputTokens: Number(data.eval_count ?? 0),
  };
}

export async function chat({ model, messages, tools }) {
  const maxAttempts = Math.max(1, config.ollama.retries + 1);
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await chatOnce({ model, messages, tools });
    } catch (err) {
      lastErr = err;
      if (!err.retryable || attempt === maxAttempts - 1) break;
      await sleep(backoffDelay(attempt));
    }
  }
  throw lastErr;
}

/** Normalize a tool call's arguments, which Ollama may send as object or JSON string. */
export function toolArgs(call) {
  const raw = call?.function?.arguments;
  if (raw == null) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: String(raw) };
  }
}

/** Check that the configured model exists; returns a short status string. */
export async function checkModel(model) {
  try {
    const res = await fetch(`${config.ollama.url}/api/tags`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return `Ollama /api/tags HTTP ${res.status}`;
    const data = await res.json();
    const names = (data.models ?? []).map((m) => m.name);
    const want = model || config.ollama.model;
    const has = names.some((n) => n === want || n.startsWith(`${want}:`));
    return has ? "ok" : `model "${want}" not pulled. Available: ${names.join(", ") || "(none)"}`;
  } catch (err) {
    return `cannot reach Ollama at ${config.ollama.url}: ${err?.message ?? err}`;
  }
}
