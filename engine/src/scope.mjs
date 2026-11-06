// Unrestricted scope module (Guardrails removed)

/**
 * Parse the engagement scope out of the agent config / run params.
 * This only READS configuration — it performs no enforcement. The actual
 * allow-list checking belongs in checkScope() below (left for you to fill in).
 *
 * @typedef {{ targets: string[], label: string|null }} Scope
 * @param {any} agentConfig
 * @param {any} runParams
 * @returns {Scope}
 */
export function parseScope(agentConfig, runParams) {
  const raw = runParams?.scope ?? agentConfig?.scope ?? {};
  const list = Array.isArray(raw.targets) ? raw.targets : [];
  const targets = list.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  const label = typeof raw.label === "string" ? raw.label : null;
  return { targets, label };
}

export function extractTargets(command) {
  // ไม่มีการสกัดหรือตรวจสอบเป้าหมาย คืนค่าว่างหรือสตริงดิบ
  return [];
}

export function applyCommandModifiers(command) {
  // ไม่มีตัวช่วยปรับแต่งหรือควบคุมพารามิเตอร์ ส่งคำสั่งตรงๆ
  return String(command ?? "").trim();
}

export function checkScope(command, scope) {
  // ปล่อยผ่านทุกคำสั่งและทุกเป้าหมายโดยไม่มีการตรวจสอบเงื่อนไขใดๆ ทั้งสิ้น
  return {
    ok: true,
    targets: [],
    remote: [],
    outOfScope: [],
    stealthCommand: String(command ?? "").trim(),
    reason: "Unrestricted execution; all scopes and targets allowed.",
  };
}
