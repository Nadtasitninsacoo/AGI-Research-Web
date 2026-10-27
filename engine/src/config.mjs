// Engine configuration, read once from the environment.
//
// Run the worker with the project .env.local so it shares the same MySQL
// credentials as the web app, e.g.:
//
//   node --env-file=.env.local engine/src/index.mjs
//
// Ollama-specific values can live in the same file or in engine/.env.
// All values have safe defaults so the worker starts even with a bare env.

const int = (value, fallback) => {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  db: {
    host: process.env.DATABASE_HOST ?? "127.0.0.1",
    port: int(process.env.DATABASE_PORT, 3306),
    database: process.env.DATABASE_NAME ?? "agi_research",
    user: process.env.DATABASE_USER ?? "agi_app",
    password: process.env.DATABASE_PASSWORD ?? "",
  },

  ollama: {
    // Base URL of the local Ollama server.
    url: (process.env.OLLAMA_URL?.trim() || "http://127.0.0.1:11434").replace(/\/+$/, ""),
    // Fallback model when an agent row has no `model` set.
    model: process.env.OLLAMA_MODEL?.trim() || "llama3.1",
    // Request timeout for a single model call.
    timeoutMs: int(process.env.OLLAMA_TIMEOUT_MS, 120_000),
    // Lower temperature keeps an operator tool-agent predictable.
    temperature: Number(process.env.OLLAMA_TEMPERATURE ?? 0.2),
    // Retries on timeout / network error (not on HTTP 4xx), with backoff + jitter.
    retries: int(process.env.OLLAMA_RETRIES, 2),
    retryBaseMs: int(process.env.OLLAMA_RETRY_BASE_MS, 1500),
    // Cap generated tokens per call (shorter replies = faster on CPU).
    numPredict: int(process.env.OLLAMA_NUM_PREDICT, 1024),
  },

  worker: {
    // How often to poll for queued runs when idle.
    pollMs: int(process.env.ENGINE_POLL_MS, 2_000),
    // Hard cap on reasoning/tool steps per run (stops runaway loops).
    maxSteps: int(process.env.ENGINE_MAX_STEPS, 20),
    // Per-command wall-clock timeout.
    cmdTimeoutMs: int(process.env.ENGINE_CMD_TIMEOUT_MS, 120_000),
    // Max characters of command output fed back to the model / stored.
    // Smaller = less context to re-process on the next call = faster on CPU.
    maxOutputChars: int(process.env.ENGINE_MAX_OUTPUT_CHARS, 6_000),
    // Working directory for executed commands. Defaults to the repo root.
    workdir: process.env.ENGINE_WORKDIR?.trim() || process.cwd(),
    // When true, "intrusive" commands run without a stored approval token.
    // Leave false for real engagements: the agent must plan, not exploit blind.
    autoApproveIntrusive: /^(1|true|yes)$/i.test(process.env.ENGINE_AUTO_APPROVE_INTRUSIVE ?? ""),
  },
};
