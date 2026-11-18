"use client";

import { useState } from "react";
import {
  MAX_SEQUENCE_STEPS,
  resolveSelection,
  type PickResolution,
  type Scope,
  type TargetField,
} from "./scopePick";

/** Presentational only — never calls the API. Lists the ACTIVE scopes as
 * checkboxes and hands back a resolution; the caller submits the job(s). */
export function ScopeTargetPicker({
  title,
  scopes,
  field,
  onResolve,
  onCancel,
}: {
  title: string;
  scopes: Scope[];
  field: TargetField;
  onResolve: (resolution: PickResolution) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const chosen = scopes.filter((s) => selected.has(s.id));
  const allSelected = scopes.length > 0 && chosen.length === scopes.length;
  const canTogether = field.fieldType === "targets";

  function toggle(id: string) {
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function go(how: "together" | "each") {
    if (chosen.length === 0) {
      setError("เลือกอย่างน้อย 1 scope");
      return;
    }
    const result = resolveSelection(chosen, field, how);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onResolve(result);
  }

  return (
    <div
      role="dialog"
      aria-label="เลือก scope"
      style={{
        marginTop: 10,
        padding: 12,
        border: "1px solid rgba(248,30,54,0.45)",
        borderRadius: 8,
        background: "rgba(248,30,54,0.06)",
        fontSize: 12.5,
      }}
    >
      <div style={{ color: "#fff", fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ color: "#8a8f99", marginBottom: 10 }}>
        มี {scopes.length} scope ที่เปิดใช้งานอยู่ — เลือกว่าจะสแกน scope ไหน
        {field.fieldType === "single" ? ` (operation นี้รับ ${field.name} ได้ทีละหนึ่งเดียว)` : ""}
      </div>

      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => {
            setError(null);
            setSelected(allSelected ? new Set() : new Set(scopes.map((s) => s.id)));
          }}
        />
        <span style={{ color: "#9ef3f5" }}>เลือกทั้งหมด</span>
      </label>

      <div style={{ maxHeight: 180, overflowY: "auto", display: "grid", gap: 6 }}>
        {scopes.map((s) => (
          <label
            key={s.id}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              padding: "6px 8px",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              cursor: "pointer",
              background: selected.has(s.id) ? "rgba(63,206,131,0.08)" : "transparent",
            }}
          >
            <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
            <span style={{ minWidth: 0 }}>
              <b style={{ color: "#e8e8ee" }}>{s.name}</b>
              <span style={{ color: "#8a8f99", wordBreak: "break-all", display: "block" }}>
                {s.targets.length > 0 ? s.targets.join(", ") : "(ไม่มี target)"}
              </span>
            </span>
          </label>
        ))}
      </div>

      {error && <div style={{ color: "#ff9aa5", marginTop: 8 }}>{error}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {canTogether && (
          <button type="button" className="op-btn op-btnOk op-btnXs" onClick={() => go("together")}>
            รันรวมเป็น 1 job
          </button>
        )}
        <button type="button" className="op-btn op-btnXs" onClick={() => go("each")}>
          รันทีละอัน (สูงสุด {MAX_SEQUENCE_STEPS})
        </button>
        <button type="button" className="op-btn op-btnXs" onClick={onCancel}>
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
