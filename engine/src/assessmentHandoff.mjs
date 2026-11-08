import http from "node:http";
import https from "node:https";

const DEFAULT_API_URL = "http://localhost:3001";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_PAYLOAD_BYTES = 512 * 1024; // Expanded threshold for dense telemetry data

// Dedicated high-performance agents with keep-alive enabled for persistent connection pooling
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 64,
  timeout: 20_000,
});
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  timeout: 20_000,
});

function getAgent(url) {
  return url.startsWith("https") ? httpsAgent : httpAgent;
}

function getApiUrl() {
  const value =
    process.env.AGI_API_URL ??
    process.env.AGI_RESEARCH_API_URL ??
    DEFAULT_API_URL;

  return value.replace(/\/+$/, "");
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeObject(value) {
  return isPlainObject(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Serializes and optimizes telemetry payload for high-speed streaming delivery.
 */

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function mapFinding(item) {
  if (!isPlainObject(item)) {
    throw new Error("Invalid finding: expected an object");
  }

  return {
    title: firstDefined(item.title, item.name, "Engine finding"),
    description: firstDefined(item.description, item.details, ""),
    category: firstDefined(item.category, item.type, "security"),
    severity: firstDefined(item.severity, item.risk, "unknown"),
    asset_reference: firstDefined(
      item.asset_reference,
      item.target,
      item.asset,
      item.host,
      "unspecified-asset",
    ),
  };
}

function mapInventory(source) {
  const inventory = safeObject(source.inventory);

  return {
    hosts: safeArray(firstDefined(inventory.hosts, source.hosts)),
    services: safeArray(firstDefined(inventory.services, source.services)),
    configurations: safeArray(
      firstDefined(inventory.configurations, source.configurations),
    ),
    permissions: safeArray(
      firstDefined(inventory.permissions, source.permissions),
    ),
  };
}

function createOptimizedPayload(result) {
  if (!isPlainObject(result)) {
    throw new Error("Invalid execution result: expected an object");
  }

  const source = result;

  const payload = {
    inventory: safeObject(source.inventory),
    findings: safeArray(source.findings),
    summary: safeObject(source.summary),
    metrics: safeObject(source.metrics),
    timestamp: new Date().toISOString(),
  };

  // Validate findings before transferring them.
  for (const finding of payload.findings) {
    if (!isPlainObject(finding)) {
      throw new Error("Invalid payload: each finding must be an object");
    }
  }

  const serialized = JSON.stringify(payload);

  if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) {
    throw new Error(
      `Telemetry payload exceeds maximum limit of ${MAX_PAYLOAD_BYTES} bytes`,
    );
  }

  return serialized;
}

/**
 * Executes a high-throughput, real-time assessment handoff with automatic retry capabilities.
 */
export async function handoffSuccessfulRun(
  { runId, experimentId, result = {} } = {},
  retries = 3,
) {
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    throw new Error("Invalid runId parameter");
  }

  if (
    experimentId !== undefined &&
    (!Number.isSafeInteger(experimentId) || experimentId <= 0)
  ) {
    throw new Error("Invalid experimentId parameter");
  }

  // Service-to-service auth: the API's ApiTokenGuard requires this Bearer token.
  const apiToken = process.env.AGI_API_TOKEN;
  if (!apiToken) {
    throw new Error(
      "AGI_API_TOKEN is not set — cannot authenticate the assessment handoff.",
    );
  }

  const apiUrl = getApiUrl();
  const endpoint = `${apiUrl}/api/security-assessments/runs/${runId}/handoff`;
  const body = createOptimizedPayload(result);
  const agent = getAgent(apiUrl);

  const timeoutMs = Number(
    process.env.AGI_HANDOFF_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
  );

  let attempt = 0;
  while (attempt < retries) {
    attempt++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Pipeline-Mode": "realtime-streaming",
          Authorization: `Bearer ${apiToken}`,
        },
        body,
        signal: controller.signal,
        // @ts-ignore - Node fetch agent configuration option
        agent,
      });

      const responseText = await response.text();
      let responseData;

      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch {
        responseData = { message: responseText.slice(0, 1000) };
      }

      if (!response.ok) {
        const errorMsg =
          responseData?.message ??
          responseData?.error ??
          `HTTP ${response.status}`;
        throw new Error(
          `Realtime handoff rejected [Attempt ${attempt}/${retries}]: ${errorMsg}`,
        );
      }

      return {
        accepted: true,
        runId,
        experimentId: experimentId ?? null,
        statusCode: response.status,
        attempts: attempt,
        response: responseData,
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        if (attempt >= retries) {
          throw new Error(
            `Realtime handoff timed out after ${timeoutMs}ms across ${retries} attempts.`,
          );
        }
      } else if (attempt >= retries) {
        throw error;
      }
      // Exponential backoff delay before retry
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt) * 200),
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
