// Engine configuration, read once from the environment with unlimited limits and offline fallback support.
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
    // Base URL of the local Ollama server with offline fallback support.
    url: (process.env.OLLAMA_URL?.trim() || "http://127.0.0.1:11434").replace(/\/+$/, ""),
    fallbackUrl: process.env.OLLAMA_FALLBACK_URL?.trim() || "http://localhost:11434",
    // Fallback model when an agent row has no `model` set.
    model: process.env.OLLAMA_MODEL?.trim() || "llama3.1",
    // Request timeout for a single model call.
    timeoutMs: int(process.env.OLLAMA_TIMEOUT_MS, 300_000),
    // Lower temperature keeps an operator tool-agent predictable.
    temperature: Number(process.env.OLLAMA_TEMPERATURE ?? 0.2),
    // Retries on timeout / network error with expanded tolerance for offline mode.
    retries: int(process.env.OLLAMA_RETRIES, 5),
    retryBaseMs: int(process.env.OLLAMA_RETRY_BASE_MS, 1000),
    // Cap generated tokens per call.
    numPredict: int(process.env.OLLAMA_NUM_PREDICT, 4096),
  },

  worker: {
    // How many runs to process concurrently (splits targets across N loops in a
    // single process; each claims runs atomically so they never collide). 1 =
    // sequential. Raise it to work several targets at once when the queue backs
    // up — mind that each loop makes its own concurrent Ollama call.
    count: Math.max(1, Math.min(16, int(process.env.WORKER_COUNT, 1))),
    // How often to poll for queued runs when idle.
    pollMs: int(process.env.ENGINE_POLL_MS, 1_000),
    // Cap on reasoning/tool steps per run.
    maxSteps: int(process.env.ENGINE_MAX_STEPS, 500),
    // Per-command wall-clock timeout.
    cmdTimeoutMs: int(process.env.ENGINE_CMD_TIMEOUT_MS, 300_000),
    // Max characters of command output fed back to the model / stored.
    maxOutputChars: int(process.env.ENGINE_MAX_OUTPUT_CHARS, 30_000),
    // Working directory for executed commands. Defaults to the repo root.
    workdir: process.env.ENGINE_WORKDIR?.trim() || process.cwd(),
    // Auto-approve intrusive actions. SAFE DEFAULT: off — intrusive commands
    // require operator approval unless explicitly enabled.
    autoApproveIntrusive: /^(1|true|yes|on)$/i.test(process.env.ENGINE_AUTO_APPROVE_INTRUSIVE ?? "false"),
    // How long an intrusive command waits for the operator's approval before it
    // times out (and is NOT run). Default gives a human time to decide.
    approvalTimeoutMs: int(process.env.ENGINE_APPROVAL_TIMEOUT_MS, 120_000),
    // How often the engine polls for the operator's decision.
    approvalPollMs: int(process.env.ENGINE_APPROVAL_POLL_MS, 500),
  },
};