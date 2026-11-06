import test from "node:test";
import assert from "node:assert/strict";

import { resolveAgentApiBaseUrl } from "../../src/lib/agentApi.js";

test("falls back to the default backend when AGI_API_URL is blank", () => {
  assert.equal(resolveAgentApiBaseUrl(""), "http://localhost:3001");
  assert.equal(resolveAgentApiBaseUrl("   "), "http://localhost:3001");
});

test("strips trailing slashes from a configured backend URL", () => {
  assert.equal(
    resolveAgentApiBaseUrl("http://localhost:3001/"),
    "http://localhost:3001",
  );
});
