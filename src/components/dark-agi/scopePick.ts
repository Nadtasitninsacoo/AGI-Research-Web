// Pure logic for "pick an approved target/scope" when a network operation is
// submitted without a target. Side-effect-free so it is testable without the
// hook, the network or React.
//
// Contract with DARK AGI: POST /jobs has no scopeId — the pick is resolved into
// concrete target values on the client BEFORE submitting. The backend
// auto-resolves a missing target only when exactly ONE scope is active;
// otherwise it answers 400 with "N scope(s) are active". Every submitted
// target must be covered by an active scope (else 403), so we only ever offer
// targets drawn from `active` scopes.

export const MAX_SEQUENCE_STEPS = 20;

export type Scope = {
  id: string;
  name: string;
  targets: string[];
  active: boolean;
};

export type TargetFieldType = "targets" | "single";
export type TargetField = { name: string; fieldType: TargetFieldType };

export type PickOperation = {
  toolId: string;
  operationId: string;
  targetKind?: string;
  fields: { name: string; type: string }[];
};

export type PickStep = { label: string; targets: string[] };

export type PickResolution =
  | { mode: "single"; targets: string[] }
  | { mode: "sequence"; steps: PickStep[]; truncated: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Does this backend error mean "several scopes are active, pick one"? Keys off
 * the exact substring the backend documents, and only on a 400. */
export function isScopeAmbiguityError(status: number, message: unknown): boolean {
  return status === 400 && typeof message === "string" && message.includes("scope(s) are active");
}

/** How many scopes the backend said are active ("4 scope(s) are active"), or null. */
export function activeCountFromMessage(message: string): number | null {
  const m = message.match(/(\d+) scope\(s\) are active/);
  return m ? Number(m[1]) : null;
}

/** Only `active === true` scopes are usable (already = enabled AND not expired —
 * never re-derived here). Malformed rows are dropped. */
export function activeScopesFrom(payload: unknown): Scope[] {
  const items = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.items)
      ? payload.items
      : [];
  const out: Scope[] = [];
  for (const raw of items) {
    if (!isRecord(raw) || raw.active !== true) continue;
    if (typeof raw.id !== "string" || typeof raw.name !== "string") continue;
    const targets = Array.isArray(raw.targets)
      ? raw.targets.filter((t): t is string => typeof t === "string" && t.trim() !== "")
      : [];
    out.push({ id: raw.id, name: raw.name, targets, active: true });
  }
  return out;
}

/** Which input field carries the target, for a network operation. `null` for
 * local operations or ones with no target field. */
export function targetFieldOf(op: PickOperation): TargetField | null {
  if (op.targetKind !== "network") return null;
  if (op.fields.some((f) => f.name === "targets")) return { name: "targets", fieldType: "targets" };
  const single = op.fields.find((f) => f.name === "host" || f.name === "domain");
  return single ? { name: single.name, fieldType: "single" } : null;
}

/** Did the user already give this field a value? A user-supplied target is
 * always respected and never overridden by auto-resolution. */
export function hasUserTarget(input: Record<string, unknown> | undefined, field: TargetField): boolean {
  const v = input?.[field.name];
  if (Array.isArray(v)) return v.length > 0;
  return typeof v === "string" ? v.trim() !== "" : v !== undefined && v !== null;
}

export function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

/** Single-scope fallback fill (the backend normally does this itself).
 * - "targets": all of the scope's targets.
 * - "single": the one address, only if the scope has exactly one; otherwise an
 *   error telling the user to be explicit (never a multi-address auto-fill). */
export function autoFill(
  scope: Scope,
  field: TargetField,
): { ok: true; value: string[] | string } | { ok: false; message: string } {
  if (field.fieldType === "targets") return { ok: true, value: dedupe(scope.targets) };
  const addrs = dedupe(scope.targets);
  if (addrs.length === 1) return { ok: true, value: addrs[0] };
  return {
    ok: false,
    message: `scope ${scope.name} has ${addrs.length} addresses — specify ${field.name} explicitly.`,
  };
}

/** Turn the picker's selection into a resolution.
 * - exactly one resulting target → single job.
 * - "together" (only valid for array fields) → ONE job, merged + de-duplicated.
 * - "each" → a sequence capped at MAX_SEQUENCE_STEPS: one step per selected
 *   scope for array fields, one step per individual address for single fields. */
export function resolveSelection(
  selected: Scope[],
  field: TargetField,
  how: "together" | "each",
): PickResolution | { error: string } {
  const merged = dedupe(selected.flatMap((s) => s.targets));
  if (merged.length === 0) return { error: "scope ที่เลือกไม่มี target ให้ใช้" };

  if (how === "together") {
    if (field.fieldType !== "targets") {
      return { error: "operation นี้รับ target ได้ทีละหนึ่งเดียว — เลือก 'รันทีละอัน' หรือเลือก target เดียว" };
    }
    return { mode: "single", targets: merged };
  }

  if (merged.length === 1) return { mode: "single", targets: merged };

  const all: PickStep[] =
    field.fieldType === "targets"
      ? selected
          .map((s) => ({ label: s.name, targets: dedupe(s.targets) }))
          .filter((s) => s.targets.length > 0)
      : merged.map((addr) => ({ label: addr, targets: [addr] }));

  if (all.length === 1) return { mode: "single", targets: all[0].targets };
  return {
    mode: "sequence",
    steps: all.slice(0, MAX_SEQUENCE_STEPS),
    truncated: all.length > MAX_SEQUENCE_STEPS,
  };
}

/** The `input` for one resolved step, merged over the user's other fields. */
export function inputFor(
  base: Record<string, unknown> | undefined,
  field: TargetField,
  targets: string[],
): Record<string, unknown> {
  return { ...(base ?? {}), [field.name]: field.fieldType === "targets" ? targets : targets[0] };
}
