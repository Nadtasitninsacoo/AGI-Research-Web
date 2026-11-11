import { test } from "node:test";
import assert from "node:assert/strict";
import { isDagiCommand, operationsFrom, parseDagiCommand, tokenizeDagi, type DagiOperation } from "./dagiCommand.ts";

test("operationsFrom reads DARK AGI's { items: [...] } shape (and a bare array)", () => {
  const op = { toolId: "nmap", operationId: "host-discovery", fields: [] };
  assert.deepEqual(operationsFrom({ items: [op, { bogus: 1 }] }), [op]);
  assert.deepEqual(operationsFrom([op]), [op]);
  assert.deepEqual(operationsFrom(null), []);
});

const ops: DagiOperation[] = [
  { toolId: "nmap", operationId: "os-fingerprint", fields: [{ name: "targets", type: "targets" }, { name: "maxRate", type: "integer" }] },
  { toolId: "nmap", operationId: "script-scan", fields: [{ name: "targets", type: "targets" }, { name: "script", type: "list" }, { name: "maxRate", type: "integer" }] },
  { toolId: "powershell", operationId: "tcp-connect-scan", fields: [{ name: "host", type: "text" }, { name: "ports", type: "text" }] },
  { toolId: "powershell", operationId: "file-hash", fields: [{ name: "path", type: "text" }] },
  { toolId: "powershell", operationId: "process-inventory", fields: [] },
];

test("isDagiCommand", () => {
  assert.equal(isDagiCommand("dagi win:procs keng"), true);
  assert.equal(isDagiCommand("  DAGI win:procs"), true);
  assert.equal(isDagiCommand("nmap:host-discovery on 10.0.0.5"), false);
  assert.equal(isDagiCommand("dagiX"), false);
});

test("alias + integer + targets coercion", () => {
  assert.deepEqual(parseDagiCommand("dagi net:osfingerprint targets=127.0.0.2 maxRate=5000 keng", ops), {
    toolId: "nmap",
    operationId: "os-fingerprint",
    input: { targets: ["127.0.0.2"], maxRate: 5000 },
  });
});

test("list field splits on commas", () => {
  const r = parseDagiCommand("dagi net:nse targets=127.0.0.2 script=default,banner maxRate=5000 keng", ops);
  assert.deepEqual(r.input, { targets: ["127.0.0.2"], script: ["default", "banner"], maxRate: 5000 });
});

test("text field stays a string even when numeric-looking; ports ranges kept", () => {
  const r = parseDagiCommand("dagi net:scan host=127.0.0.2 ports=21,22,80,443 keng", ops);
  assert.deepEqual(r.input, { host: "127.0.0.2", ports: "21,22,80,443" });
});

test("no fields, keng optional", () => {
  assert.deepEqual(parseDagiCommand("dagi win:procs", ops), { toolId: "powershell", operationId: "process-inventory", input: {} });
});

test("quoted path with spaces and backslashes", () => {
  const r = parseDagiCommand('dagi fs:hash path="C:\\Program Files\\a b.exe" keng', ops);
  assert.deepEqual(r.input, { path: "C:\\Program Files\\a b.exe" });
  assert.deepEqual(tokenizeDagi('a b="c d"'), ["a", "b=c d"]);
});

test("full toolId:operationId verb accepted", () => {
  assert.equal(parseDagiCommand("dagi powershell:process-inventory keng", ops).operationId, "process-inventory");
});

test("errors: unknown verb, unknown field, bad number, bad token", () => {
  assert.throws(() => parseDagiCommand("dagi nope:x keng", ops), /ไม่รู้จักคำสั่ง/);
  assert.throws(() => parseDagiCommand("dagi net:scan foo=1 keng", ops), /ไม่ใช่ฟิลด์/);
  assert.throws(() => parseDagiCommand("dagi net:osfingerprint maxRate=abc keng", ops), /ตัวเลข/);
  assert.throws(() => parseDagiCommand("dagi net:scan hostonly keng", ops), /key=value/);
  assert.throws(() => parseDagiCommand("dagi net:ping targets=1.1.1.1 keng", ops), /ใช้ไม่ได้/);
});

// Every line from the operator's two manual test sheets, parsed against the
// field names/types declared by the backend adapters (nmap.ts, native-ops.ts,
// inspectors.ts, windows.ts). Catches typos in aliases/fields across the set.
const T = (name: string) => ({ name, type: "text" });
const I = (name: string) => ({ name, type: "integer" });
const TG = { name: "targets", type: "targets" };
const REAL: DagiOperation[] = [
  { toolId: "nmap", operationId: "host-discovery", fields: [TG, I("maxRate")] },
  { toolId: "nmap", operationId: "port-inventory", fields: [TG, T("ports"), I("topPorts"), I("maxRate")] },
  { toolId: "nmap", operationId: "service-identification", fields: [TG, T("ports"), I("topPorts"), I("maxRate")] },
  { toolId: "nmap", operationId: "os-fingerprint", fields: [TG, I("maxRate")] },
  { toolId: "nmap", operationId: "script-scan", fields: [TG, { name: "script", type: "list" }, I("maxRate")] },
  { toolId: "powershell", operationId: "tcp-connect-scan", fields: [T("host"), T("ports")] },
  { toolId: "powershell", operationId: "dns-inspection", fields: [T("host")] },
  { toolId: "powershell", operationId: "routing-table", fields: [] },
  { toolId: "powershell", operationId: "traceroute", fields: [T("host")] },
  { toolId: "powershell", operationId: "http-security-headers", fields: [T("host")] },
  { toolId: "powershell", operationId: "http-request", fields: [T("host"), T("path")] },
  { toolId: "powershell", operationId: "tls-inspection", fields: [T("host"), I("port")] },
  { toolId: "powershell", operationId: "certificate-inspector", fields: [T("path")] },
  { toolId: "powershell", operationId: "certificate-store-inspector", fields: [T("storeLocation"), T("storeName")] },
  { toolId: "powershell", operationId: "system-info", fields: [] },
  { toolId: "powershell", operationId: "process-inventory", fields: [] },
  { toolId: "powershell", operationId: "service-inventory", fields: [] },
  { toolId: "powershell", operationId: "network-connections", fields: [] },
  { toolId: "powershell", operationId: "firewall-profiles", fields: [] },
  { toolId: "powershell", operationId: "arp-discovery", fields: [] },
  { toolId: "powershell", operationId: "ip-configuration", fields: [] },
  { toolId: "powershell", operationId: "scheduled-tasks", fields: [] },
  { toolId: "powershell", operationId: "startup-items", fields: [] },
  { toolId: "powershell", operationId: "installed-software", fields: [] },
  { toolId: "powershell", operationId: "event-log-query", fields: [T("logName"), I("maxEvents")] },
  { toolId: "powershell", operationId: "file-hash", fields: [T("path")] },
  { toolId: "powershell", operationId: "file-metadata", fields: [T("path")] },
  { toolId: "defender", operationId: "status", fields: [] },
];

const SHEET: [string, string, Record<string, unknown>][] = [
  ["dagi net:ping targets=127.0.0.2 keng", "host-discovery", { targets: ["127.0.0.2"] }],
  ["dagi net:ports targets=127.0.0.2 keng", "port-inventory", { targets: ["127.0.0.2"] }],
  ["dagi net:services targets=127.0.0.2 keng", "service-identification", { targets: ["127.0.0.2"] }],
  ["dagi net:osfingerprint targets=127.0.0.2 maxRate=5000 keng", "os-fingerprint", { targets: ["127.0.0.2"], maxRate: 5000 }],
  ["dagi net:nse targets=127.0.0.2 script=default,banner maxRate=5000 keng", "script-scan", { targets: ["127.0.0.2"], script: ["default", "banner"], maxRate: 5000 }],
  ["dagi net:scan host=127.0.0.2 ports=21,22,80,443 keng", "tcp-connect-scan", { host: "127.0.0.2", ports: "21,22,80,443" }],
  ["dagi net:dns host=127.0.0.2 keng", "dns-inspection", { host: "127.0.0.2" }],
  ["dagi net:route keng", "routing-table", {}],
  ["dagi net:trace host=127.0.0.2 keng", "traceroute", { host: "127.0.0.2" }],
  ["dagi web:headers host=127.0.0.2 keng", "http-security-headers", { host: "127.0.0.2" }],
  ["dagi web:get host=127.0.0.2 keng", "http-request", { host: "127.0.0.2" }],
  ["dagi crypto:tls host=127.0.0.2 port=443 keng", "tls-inspection", { host: "127.0.0.2", port: 443 }],
  ["dagi crypto:cert path=C:\\dagi-test\\test.cer keng", "certificate-inspector", { path: "C:\\dagi-test\\test.cer" }],
  ["dagi crypto:certstore storeLocation=CurrentUser storeName=My keng", "certificate-store-inspector", { storeLocation: "CurrentUser", storeName: "My" }],
  ["dagi crypto:certstore storeLocation=LocalMachine storeName=Root keng", "certificate-store-inspector", { storeLocation: "LocalMachine", storeName: "Root" }],
  ["dagi win:sysinfo keng", "system-info", {}],
  ["dagi win:procs keng", "process-inventory", {}],
  ["dagi win:services keng", "service-inventory", {}],
  ["dagi win:netstat keng", "network-connections", {}],
  ["dagi win:firewall keng", "firewall-profiles", {}],
  ["dagi win:defender keng", "status", {}],
  ["dagi win:tasks keng", "scheduled-tasks", {}],
  ["dagi win:startup keng", "startup-items", {}],
  ["dagi win:software keng", "installed-software", {}],
  ["dagi win:events logName=System maxEvents=20 keng", "event-log-query", { logName: "System", maxEvents: 20 }],
  ["dagi win:events logName=Application maxEvents=20 keng", "event-log-query", { logName: "Application", maxEvents: 20 }],
  ["dagi net:arp keng", "arp-discovery", {}],
  ["dagi net:ipconfig keng", "ip-configuration", {}],
  ["dagi fs:hash path=C:\\Windows\\System32\\drivers\\etc\\hosts keng", "file-hash", { path: "C:\\Windows\\System32\\drivers\\etc\\hosts" }],
  ["dagi fs:meta path=C:\\Windows\\System32\\drivers\\etc\\hosts keng", "file-metadata", { path: "C:\\Windows\\System32\\drivers\\etc\\hosts" }],
  ["dagi fs:meta path=C:\\Windows\\System32\\drivers\\etc keng", "file-metadata", { path: "C:\\Windows\\System32\\drivers\\etc" }],
];

for (const [line, operationId, input] of SHEET) {
  test(`sheet: ${line}`, () => {
    const r = parseDagiCommand(line, REAL);
    assert.equal(r.operationId, operationId);
    assert.deepEqual(r.input, input);
  });
}

test("sheet: 'web:get url=…' is rejected — the field is host (+ optional path), not url", () => {
  assert.throws(() => parseDagiCommand("dagi web:get url=http://127.0.0.2/ keng", REAL), /ไม่ใช่ฟิลด์/);
});
