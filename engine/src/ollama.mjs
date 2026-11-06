// File: src/ollama.mjs
// Production-grade Ollama client with multi-endpoint fallback, exponential backoff,
// structured tool calling, and precise error/availability telemetry.

import { config } from "./config.mjs";

/** Exponential backoff with full jitter, capped at 30s. */
export function backoffDelay(attempt, baseMs = config.ollama.retryBaseMs) {
  const ceiling = Math.min(baseMs * 2 ** attempt, 30_000);
  return Math.floor(Math.random() * ceiling);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 
 * Classify connection, timeout, HTTP, and parsing errors explicitly.
 */
class OllamaError extends Error {
  constructor(type, message, status = null) {
    super(message);
    this.name = "OllamaError";
    this.type = type; // 'offline' | 'timeout' | 'http_error' | 'invalid_response'
    this.status = status;
  }
}

/** One model call with multi-endpoint fallback and granular error classification. */
async function chatOnce({ model, messages, tools }) {
  const endpoints = [
    config.ollama.url,
    config.ollama.fallbackUrl,
    "http://127.0.0.1:11434",
    "http://localhost:11434"
  ].filter(Boolean);

  const uniqueEndpoints = [...new Set(endpoints)];

  const body = {
    model: model || config.ollama.model,
    messages: [
      {
        role: "system",
        content: "You are a professional AI security research assistant and active testing intelligence engine. Provide technically accurate, objective security assessments, configuration analysis, and vulnerability diagnostics for authorized targets and isolated labs."
      },
      ...messages
    ],
    stream: false,
    options: { 
      temperature: config.ollama.temperature, 
      num_predict: config.ollama.numPredict,
      top_p: 0.95,
      repeat_penalty: 1.1
    },
  };
  if (tools && tools.length) body.tools = tools;

  let lastError = null;

  for (const endpoint of uniqueEndpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.ollama.timeoutMs);

      const res = await fetch(`${endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      }).catch((err) => {
        if (err.name === "AbortError") {
          throw new OllamaError("timeout", `Ollama request timed out after ${config.ollama.timeoutMs}ms at ${endpoint}`);
        }
        throw new OllamaError("offline", `Failed to connect to Ollama server at ${endpoint}: ${err.message}`);
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new OllamaError("http_error", `Ollama HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
      }

      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        throw new OllamaError("invalid_response", `Failed to parse JSON response from Ollama: ${parseErr.message}`);
      }

      return {
        message: data.message ?? { role: "assistant", content: "" },
        promptTokens: Number(data.prompt_eval_count ?? 0),
        outputTokens: Number(data.eval_count ?? 0),
        endpointUsed: endpoint,
        status: "success",
      };
    } catch (err) {
      lastError = err;
      // If it's an explicit HTTP error or timeout, we can either continue to next endpoint or throw if final
      if (err instanceof OllamaError && (err.type === "http_error" && err.status < 500)) {
        throw err; // Client errors shouldn't cycle through fallback endpoints blindly
      }
    }
  }

  throw lastError || new OllamaError("offline", "All Ollama endpoints are unreachable.");
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

  throw lastErr || new OllamaError("offline", "Ollama chat execution failed after maximum retries.");
}

/** Normalize a tool call's arguments with robust error handling and malformed JSON validation. */
export function toolArgs(call) {
  const raw = call?.function?.arguments;
  if (raw == null) return {};
  if (typeof raw === "object") return raw;
  
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Malformed tool-call argument JSON: ${err.message} (Raw: ${String(raw).slice(0, 100)})`);
  }
}

/** Check that the configured model exists with actual availability and health inspection. */
export async function checkModel(model) {
  const endpoints = [config.ollama.url, config.ollama.fallbackUrl, "http://127.0.0.1:11434", "http://localhost:11434"];
  const uniqueEndpoints = [...new Set(endpoints.filter(Boolean))];
  
  let lastErr = null;

  for (const ep of uniqueEndpoints) {
    try {
      const res = await fetch(`${ep}/api/tags`, { signal: AbortSignal.timeout(3_000) });
      if (!res.ok) continue;
      
      const data = await res.json();
      const names = (data.models ?? []).map((m) => m.name);
      const want = model || config.ollama.model;
      const has = names.some((n) => n === want || n.startsWith(`${want}:`));
      
      if (!has) {
        return { status: "model_not_installed", endpoint: ep, availableModels: names };
      }
      return { status: "ok", endpoint: ep };
    } catch (err) {
      lastErr = err;
    }
  }

  return { status: "offline", error: lastErr?.message ?? "Ollama service unavailable" };
}