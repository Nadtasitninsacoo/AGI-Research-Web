// Tool-registry loader: discovers which registered tools are installed and
// builds their commands. Execution still goes through execRunCommand, so every
// tool inherits the engine's scope + policy + approval governance.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TOOL_REGISTRY, getToolDef, sanitizeArg } from "../tools/registry.mjs";

const run = promisify(execFile);
let availCache = null; // Set<string> of installed bins, or null when unknown.

export { getToolDef };

/** Best-effort "which tools are installed" check (batched, cached). */
export async function detectAvailable(timeoutMs = 8000) {
  if (availCache) return availCache;
  const found = new Set();
  const wslBins = [
    ...new Set(TOOL_REGISTRY.filter((t) => t.shell === "wsl").map((t) => t.bin)),
  ];
  if (wslBins.length) {
    try {
      const script = wslBins
        .map((b) => `command -v ${b} >/dev/null 2>&1 && echo ${b}`)
        .join("; ");
      const { stdout } = await run("wsl.exe", ["bash", "-lc", script], {
        timeout: timeoutMs,
        windowsHide: true,
      });
      for (const s of stdout.split(/\s+/)) if (s) found.add(s);
      availCache = found;
    } catch {
      // WSL missing or errored — availability stays unknown (don't cache).
      return null;
    }
  } else {
    availCache = found;
  }
  return availCache;
}

/** Resolve a tool id + target into a concrete, sanitized command. */
export async function buildToolCommand(id, target, extra) {
  const def = getToolDef(id);
  if (!def) {
    return { ok: false, error: `ไม่รู้จักเครื่องมือ "${id}" — เรียก list_tools เพื่อดูรายการ` };
  }
  const t = sanitizeArg(target);
  if (def.scopeRequired && !t) {
    return { ok: false, error: `เครื่องมือ ${def.id} ต้องระบุ target ที่อยู่ในขอบเขตที่อนุญาต` };
  }
  return { ok: true, def, command: def.build(t, extra), shell: def.shell };
}

/** Human-readable catalog for the agent (list_tools). */
export async function formatToolCatalog() {
  const avail = await detectAvailable().catch(() => null);
  const lines = TOOL_REGISTRY.map((t) => {
    const status =
      avail == null ? "? unknown" : avail.has(t.bin) ? "✓ installed" : "✗ not installed";
    const scope = t.scopeRequired ? " · scope-required" : "";
    return `- ${t.id} [${t.category}/${t.risk}${scope}] ${status} — ${t.usage}`;
  });
  return [
    "TOOL REGISTRY — เครื่องมือที่ลงทะเบียน (ทุกตัวรันผ่าน scope + policy + approval):",
    ...lines,
    'เรียกใช้: run_tool { tool, target, extra? } · passive=ปลอดภัย, active/intrusive ต้องอยู่ในขอบเขตและอาจต้องอนุมัติ',
  ].join("\n");
}
