// Minimal Gemini (Google Generative Language API) chat client, shaped to the
// same { message, promptTokens, outputTokens } contract as ollama.mjs so it
// can act as a drop-in fallback when no Ollama endpoint is reachable.
//
// This module is only ever called when GEMINI_API_KEY is configured — see
// ollama.mjs, which owns the "try Ollama, then fall back to Gemini" decision.
import { config } from "./config.mjs";

/** Recursively uppercase JSON-Schema "type" values and drop keys Gemini's
 * Schema object doesn't understand, so our existing OpenAI/Ollama-style tool
 * definitions (lowercase "object"/"string"/...) work unmodified for Gemini. */
function sanitizeSchema(schema) {
  if (schema == null || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);

  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties" || key === "$schema" || key === "default") continue;
    if (key === "type" && typeof value === "string") {
      out.type = value.toUpperCase();
      continue;
    }
    out[key] = typeof value === "object" && value !== null ? sanitizeSchema(value) : value;
  }
  return out;
}

/** Convert OpenAI/Ollama-style `tools` into Gemini's functionDeclarations. */
function toGeminiTools(tools) {
  if (!Array.isArray(tools) || !tools.length) return undefined;

  const functionDeclarations = tools
    .filter((t) => t?.type === "function" && t.function?.name)
    .map((t) => ({
      name: t.function.name,
      description: t.function.description ?? "",
      parameters: sanitizeSchema(t.function.parameters ?? { type: "OBJECT", properties: {} }),
    }));

  return functionDeclarations.length ? [{ functionDeclarations }] : undefined;
}

/** Convert our OpenAI/Ollama-style message history into Gemini `contents`
 * (+ a separate systemInstruction, since Gemini doesn't accept a "system"
 * role inside contents). */
function toGeminiContents(messages) {
  const contents = [];
  let systemInstruction;

  for (const m of messages ?? []) {
    if (m.role === "system") {
      systemInstruction = systemInstruction ? `${systemInstruction}\n\n${m.content}` : String(m.content ?? "");
      continue;
    }

    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: String(m.content ?? "") }] });
      continue;
    }

    if (m.role === "assistant") {
      const parts = [];
      if (m.content) parts.push({ text: String(m.content) });
      for (const call of m.tool_calls ?? []) {
        let args = call?.function?.arguments;
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            args = { _raw: args };
          }
        }
        parts.push({ functionCall: { name: call?.function?.name, args: args ?? {} } });
      }
      contents.push({ role: "model", parts: parts.length ? parts : [{ text: "" }] });
      continue;
    }

    if (m.role === "tool") {
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: m.name,
              response: { content: String(m.content ?? "") },
            },
          },
        ],
      });
      continue;
    }
  }

  return { systemInstruction, contents };
}

/** Convert a Gemini generateContent response back into our message shape. */
function fromGeminiResponse(data) {
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];

  let content = "";
  const toolCalls = [];
  for (const part of parts) {
    if (typeof part?.text === "string") content += part.text;
    if (part?.functionCall?.name) {
      toolCalls.push({
        function: { name: part.functionCall.name, arguments: part.functionCall.args ?? {} },
      });
    }
  }

  return {
    message: { role: "assistant", content, tool_calls: toolCalls.length ? toolCalls : undefined },
    promptTokens: Number(data?.usageMetadata?.promptTokenCount ?? 0),
    outputTokens: Number(data?.usageMetadata?.candidatesTokenCount ?? 0),
  };
}

/** One Gemini generateContent call. Throws on any failure — the caller
 * (ollama.mjs) decides what honest fallback behaviour follows. */
export async function chat({ model, messages, tools }) {
  const apiKey = config.gemini.apiKey;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const useModel = (model && String(model).trim()) || config.gemini.model;
  const { systemInstruction, contents } = toGeminiContents(messages);

  const body = {
    contents,
    generationConfig: {
      temperature: config.gemini.temperature,
      maxOutputTokens: config.gemini.maxOutputTokens,
    },
  };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  const geminiTools = toGeminiTools(tools);
  if (geminiTools) body.tools = geminiTools;

  const res = await fetch(
    `${config.gemini.url}/models/${encodeURIComponent(useModel)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.gemini.timeoutMs),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  return fromGeminiResponse(data);
}

/** Honestly check whether Gemini is actually usable right now (key present
 * AND the model endpoint responds) — never assumed true just because a key
 * is set. */
export async function isModelAvailable(model) {
  const apiKey = config.gemini.apiKey;
  if (!apiKey) return false;

  const useModel = (model && String(model).trim()) || config.gemini.model;
  try {
    const res = await fetch(
      `${config.gemini.url}/models/${encodeURIComponent(useModel)}?key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    return res.ok;
  } catch {
    return false;
  }
}
