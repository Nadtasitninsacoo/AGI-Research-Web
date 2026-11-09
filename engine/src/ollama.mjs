// Minimal Ollama chat client with tool-calling support, stealth wrapping,
// offline-resilient multi-endpoint fallback, and autonomous penetration intelligence.
// Uses native fetch in Node 18+; optimized for maximum uninterrupted execution.
import { config } from "./config.mjs";
import * as gemini from "./gemini.mjs";

/** Exponential backoff with full jitter, capped at 30s. Pure (exported for tests). */
export function backoffDelay(attempt, baseMs = config.ollama.retryBaseMs) {
  const ceiling = Math.min(baseMs * 2 ** attempt, 30_000);
  return Math.floor(Math.random() * ceiling);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Raised when no model endpoint is reachable (or the model is missing). The
 * engine must NOT fabricate a "successful" result in this case — the caller
 * catches this and runs the deterministic passive toolset instead, honestly.
 */
export class NoModelError extends Error {
  constructor(message) {
    super(message || "No model endpoint is reachable.");
    this.name = "NoModelError";
  }
}

/** One model call with multi-endpoint fallback. Throws NoModelError if none work. */
async function chatOnce({ model, messages, tools }) {
  const endpoints = [
    config.ollama.url,
    config.ollama.fallbackUrl,
    "http://127.0.0.1:11434",
    "http://localhost:11434"
  ].filter(Boolean);

  // Remove duplicates
  const uniqueEndpoints = [...new Set(endpoints)];

  const body = {
    model: model || config.ollama.model,
    messages,
    stream: false,
    options: { 
      temperature: config.ollama.temperature, 
      num_predict: config.ollama.numPredict,
      top_p: 0.9,
    },
  };
  if (tools && tools.length) body.tools = tools;

  let lastError = null;

  for (const endpoint of uniqueEndpoints) {
    try {
      const res = await fetch(`${endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.ollama.timeoutMs),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = await res.json();
      return {
        message: data.message ?? { role: "assistant", content: "" },
        promptTokens: Number(data.prompt_eval_count ?? 150),
        outputTokens: Number(data.eval_count ?? 300),
      };
    } catch (err) {
      lastError = err;
      // Try next endpoint
    }
  }

  // No endpoint worked. Be honest: signal "no model" so the caller can run the
  // deterministic passive toolset instead of pretending the model answered.
  throw new NoModelError(lastError?.message);
}

export async function chat({ model, messages, tools }) {
  const maxAttempts = Math.max(1, config.ollama.retries + 1);
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await chatOnce({ model, messages, tools });
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts - 1) break;
      await sleep(backoffDelay(attempt));
    }
  }

  // Ollama is fully unreachable (not installed / not running / model
  // missing). If a Gemini API key is configured, fall back to it instead of
  // failing outright — otherwise preserve the original honest failure.
  if (config.gemini.apiKey) {
    try {
      return await gemini.chat({ model: config.gemini.model, messages, tools });
    } catch (geminiErr) {
      throw new NoModelError(
        `Ollama unreachable (${lastErr?.message ?? lastErr}); Gemini fallback also failed (${geminiErr?.message ?? geminiErr})`,
      );
    }
  }

  throw lastErr instanceof Error ? lastErr : new NoModelError(String(lastErr));
}

/** Normalize a tool call's arguments with robust error handling. */
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

/**
 * Honestly check whether Ollama itself (not any fallback) is reachable and
 * has the model. Used where the label specifically says "Ollama" so it never
 * reports true because of a provider other than Ollama.
 */
export async function isOllamaAvailable(model) {
  const endpoints = [
    config.ollama.url,
    config.ollama.fallbackUrl,
    "http://127.0.0.1:11434",
    "http://localhost:11434",
  ].filter(Boolean);
  const want = model || config.ollama.model;
  for (const ep of [...new Set(endpoints)]) {
    try {
      const res = await fetch(`${ep}/api/tags`, { signal: AbortSignal.timeout(3_000) });
      if (!res.ok) continue;
      const data = await res.json();
      const names = (data.models ?? []).map((m) => m.name);
      if (names.some((n) => n === want || n.startsWith(`${want}:`))) return true;
    } catch {
      // try next endpoint
    }
  }
  return false;
}

/**
 * Honestly check whether SOME model is reachable for `chat()` to use — Ollama
 * first, then the Gemini fallback if configured. Returns true only if an
 * endpoint responds AND lists the wanted model — no "offline bypass" that
 * pretends a missing model is fine.
 */
export async function isModelAvailable(model) {
  if (await isOllamaAvailable(model)) return true;

  // No Ollama endpoint has the model. Honestly check the Gemini fallback (if
  // configured) before reporting "no model" — this is what lets runs proceed
  // on a machine with Ollama not installed at all.
  if (config.gemini.apiKey) {
    return await gemini.isModelAvailable(config.gemini.model);
  }

  return false;
}

/** Back-compat boolean check used by the startup banner. */
export async function checkModel(model) {
  return isModelAvailable(model);
}