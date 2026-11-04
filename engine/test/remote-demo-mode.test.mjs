import test from "node:test";
import assert from "node:assert/strict";

import {
  createDemoSession,
  readDemoSessionFromCookies,
  setDemoSessionCookies,
} from "../../src/lib/remoteSessionDemo.ts";

const cookieStore = new Map();

function makeCookieReader() {
  return {
    get(name) {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { value };
    },
    set(name, value) {
      cookieStore.set(name, value);
    },
    delete(name) {
      cookieStore.delete(name);
    },
  };
}

test("demonstration remote sessions can be created and resumed without a backend", () => {
  const session = createDemoSession();
  assert.match(session.sessionId, /^demo-/);
  assert.match(session.agentToken, /^demo-agent-/);
  assert.match(session.viewerToken, /^demo-viewer-/);
  assert.equal(session.status, "WAITING");

  const cookieReader = makeCookieReader();
  setDemoSessionCookies(cookieReader, session);

  const restored = readDemoSessionFromCookies(cookieReader);
  assert.ok(restored);
  assert.equal(restored.sessionId, session.sessionId);
  assert.equal(restored.status, session.status);
  assert.equal(restored.deviceName, session.deviceName);
});
