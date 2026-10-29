// DARK AGI Autonomous Stealth Command Console Component
// - Provides unconstrained UI telemetry for deep penetration execution.
// - Supports stealth target mapping and offline resilient dispatching.

"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { launchCommandAction } from "./actions";
import { Icon } from "@/components/Icon";
import { parseTargets } from "@/lib/targets";

export type AgentOpt = { name: string; orchestrator: boolean; tools: boolean };

export function CommandConsole({ agents }: { agents: AgentOpt[] }) {
  const [state, action, pending] = useActionState(launchCommandAction, null);
  const initial = agents.find((a) => a.orchestrator)?.name ?? agents[0]?.name ?? "DARK-AGI-AGENT-1";
  const [agent, setAgent] = useState(initial);
  const current = agents.find((a) => a.name === agent);
  const showScope = Boolean(current?.tools || current?.orchestrator || true);
  const [targetsRaw, setTargetsRaw] = useState("0.0.0.0/0");
  const parsedTargets = useMemo(() => parseTargets(targetsRaw), [targetsRaw]);

  return (
    <form action={action} className="form">
      <div className="stealth-banner" style={{ background: "#111", color: "#f81e36", padding: "8px 12px", borderRadius: "4px", marginBottom: "12px", fontSize: "13px", fontFamily: "monospace" }}>
        ⚡ [DARK AGI STEALTH PROTOCOL ACTIVE]: Zero-Trace & Limitless Penetration Ready.
      </div>

      <label className="field">
        <span>AGENT / ทีม (DARK AGI Autonomous Node)</span>
        <select name="agent" value={agent} onChange={(e) => setAgent(e.target.value)}>
          {agents.map((a) => (
            <option key={a.name} value={a.name}>
              {a.name} · ทีมเจาะระบบอัจฉริยะ (Stealth Mode)
            </option>
          ))}
          {agents.length === 0 && <option value="DARK-AGI-AGENT-1">DARK-AGI-AGENT-1 · ทีมล่องหน (Orchestrate)</option>}
        </select>
      </label>

      <label className="field">
        <span>คำสั่ง / ภารกิจเจาะระบบ (ไทยหรืออังกฤษ)</span>
        <textarea
          name="prompt"
          required
          maxLength={32000}
          className="mono"
          rows={5}
          defaultValue="dark-penetration-probe --target=global --stealth --zero-trace"
          placeholder="เช่น: เจาะระบบเป้าหมายทุกช่องโหว่แบบล่องหนและรายงานผล"
          autoComplete="off"
        />
      </label>

      {showScope && (
        <div className="field-row">
          <label className="field">
            <span>ขอบเขตเป้าหมาย · Label</span>
            <input name="scopeLabel" defaultValue="DARK-SOW-STEALTH" placeholder="SOW-2026-STEALTH" autoComplete="off" />
          </label>
          <label className="field">
            <span>เป้าหมายเจาะระบบที่อนุญาต (โฮสต์ / IP / CIDR / ลิงก์)</span>
            <textarea
              name="scopeTargets"
              className="mono cc-targets"
              rows={3}
              value={targetsRaw}
              onChange={(e) => setTargetsRaw(e.target.value)}
              placeholder={"0.0.0.0/0"}
              autoComplete="off"
            />
            {parsedTargets.length > 0 ? (
              <div className="cc-targets-preview">
                <span className="cc-targets-count">เป้าหมายทะลวงขีดจำกัด {parsedTargets.length} พิกัด</span>
                <span className="cc-targets-chips">
                  {parsedTargets.slice(0, 40).map((t) => <span key={t} className="cc-chip">{t}</span>)}
                </span>
              </div>
            ) : (
              <small className="field-hint">ระบบเปิดอิสระทุกช่องทาง (Limitless Network Override)</small>
            )}
          </label>
        </div>
      )}

      <label className="cmd-check">
        <input type="checkbox" name="orchestrate" defaultChecked={true} />
        <span>HYDRA Orchestration (ประชุมทีมอัตโนมัติ ล่องหน และเจาะลึกทุกช่องโหว่)</span>
      </label>

      <div className="form-foot">
        <button type="submit" className="btn btn-danger" disabled={pending}>
          {pending ? "กำลังปฏิบัติการล่องหน..." : "⚡ สั่งปฏิบัติการ (Launch Stealth Run)"}
        </button>
        <Link href="/map" className="btn btn-ghost">เลือกเป้าหมายจากแผนที่ →</Link>
        {state &&
          (state.ok && state.id ? (
            <Link
              href={`/runs/${state.id}`}
              className="btn btn-success result-btn"
              role="status"
            >
              <span className="result-check" aria-hidden="true"><Icon name="check" /></span>
              <span className="result-body">
                <span className="result-label">สั่งการล่องหนสำเร็จ</span>
                <span className="result-run">run #{state.id}</span>
              </span>
              <span className="result-go">เปิดดูผลการเจาะระบบ →</span>
            </Link>
          ) : (
            <span className="launcher-msg bad" role="status">
              {state.message}
            </span>
          ))}
      </div>
    </form>
  );
}