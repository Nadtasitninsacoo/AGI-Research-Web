"use client";

import { useMemo, useState } from "react";
import { ALLOWED_NSE_NAMES, clampMaxRate, parseTargetsInput, validateNseScripts } from "@/lib/dark-agi/nseAllowList";

// Dedicated input form for the two operations the Command Reference's plain
// "รันทันที" button can't handle alone (they have required fields beyond
// "targets"): nmap:os-fingerprint (maxRate) and nmap:script-scan (script[],
// maxRate). Client-side NSE validation only narrows what this form itself can
// submit — DARK AGI's own server-side scope/schema check is still the real
// gate, and a human can still type a louder script directly into the
// Terminal's own input box in DIRECT/AI mode if that's genuinely what they
// want to do (this form is just a safer on-ramp for the common case).

type Props = {
  operationId: "os-fingerprint" | "script-scan";
  maxRateCap: number;
  disabled: boolean;
  onRun: (input: Record<string, unknown>) => void;
};

export function NmapAdvancedForm({ operationId, maxRateCap, disabled, onRun }: Props) {
  const [targetsText, setTargetsText] = useState("");
  const [maxRateText, setMaxRateText] = useState("");
  const [scriptsText, setScriptsText] = useState("default,safe");
  const [error, setError] = useState("");

  // Live count of how many targets this will actually submit — "ว่าง" (0) is
  // valid too (means "use the active Scope"), so this is informational, not
  // itself a validation gate.
  const parsedTargets = useMemo(() => parseTargetsInput(targetsText), [targetsText]);

  function submit() {
    setError("");
    const targets = parsedTargets;
    if (targets.length === 0) {
      setError("ใส่ target อย่างน้อย 1 รายการ (คั่นด้วย , หรือขึ้นบรรทัดใหม่) — หรือเว้นว่างไว้เพื่อใช้ Scope ที่เปิดอยู่");
    }
    const maxRate = maxRateText.trim()
      ? clampMaxRate(Number(maxRateText), maxRateCap)
      : undefined;

    const input: Record<string, unknown> = {};
    if (targets.length > 0) input.targets = targets;
    if (maxRate !== undefined) input.maxRate = maxRate;

    if (operationId === "script-scan") {
      const scripts = scriptsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const check = validateNseScripts(scripts);
      if (!check.ok) {
        setError(check.reason);
        return;
      }
      input.script = check.scripts;
    }

    if (targets.length === 0 && Object.keys(input).length === 0) return; // nothing to send, already errored above
    onRun(input);
  }

  return (
    <div
      style={{
        marginTop: 8,
        padding: 8,
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 6,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <label style={{ display: "block", fontSize: 10, marginBottom: 4 }}>
        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span>Targets (ว่าง = ใช้ Scope ที่เปิดอยู่)</span>
          <span
            className="op-mono"
            style={{ color: parsedTargets.length > 0 ? "#8ff0bb" : "rgba(255,255,255,0.35)", fontSize: 10 }}
          >
            {parsedTargets.length > 0 ? `ระบุแล้ว ${parsedTargets.length} รายการ` : "0 รายการ"}
          </span>
        </span>
        <textarea
          value={targetsText}
          onChange={(e) => setTargetsText(e.target.value)}
          placeholder="10.0.0.5, 10.0.0.0/24"
          rows={2}
          className="op-mono"
          style={{
            width: "100%",
            marginTop: 2,
            background: "#05060a",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 4,
            color: "#e6fdfd",
            fontSize: 11,
            padding: 4,
          }}
        />
      </label>

      {operationId === "script-scan" && (
        <label style={{ display: "block", fontSize: 10, marginBottom: 4 }}>
          NSE scripts/categories (allow-list เท่านั้น: {[...ALLOWED_NSE_NAMES].join(", ")})
          <input
            value={scriptsText}
            onChange={(e) => setScriptsText(e.target.value)}
            className="op-mono"
            style={{
              width: "100%",
              marginTop: 2,
              background: "#05060a",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 4,
              color: "#e6fdfd",
              fontSize: 11,
              padding: 4,
            }}
          />
        </label>
      )}

      <label style={{ display: "block", fontSize: 10, marginBottom: 4 }}>
        Max rate (packets/sec, สูงสุด {maxRateCap})
        <input
          value={maxRateText}
          onChange={(e) => setMaxRateText(e.target.value)}
          placeholder={`default 500, cap ${maxRateCap}`}
          inputMode="numeric"
          className="op-mono"
          style={{
            width: "100%",
            marginTop: 2,
            background: "#05060a",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 4,
            color: "#e6fdfd",
            fontSize: 11,
            padding: 4,
          }}
        />
      </label>

      {error && (
        <div style={{ fontSize: 10, color: "#ff9aa5", marginBottom: 4 }}>{error}</div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        className="op-btn op-btnOk op-btnXs"
        style={{ width: "100%", justifyContent: "center" }}
      >
        รันด้วยค่าที่กรอกไว้
      </button>
    </div>
  );
}
