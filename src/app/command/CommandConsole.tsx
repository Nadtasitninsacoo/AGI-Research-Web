// Command Console component
// - Provides UI telemetry for command execution.
// - Supports target mapping and resilient dispatching.

"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { launchCommandAction } from "./actions";
import { Icon } from "@/components/Icon";
import { parseTargets } from "@/lib/targets";

export type AgentOpt = { name: string; orchestrator: boolean; tools: boolean };

export function CommandConsole({ agents }: { agents: AgentOpt[] }) {
  const [state, action, pending] = useActionState(launchCommandAction, null);
  const initial = agents.find((a) => a.orchestrator)?.name ?? agents[0]?.name ?? "agent-1";
  const [agent, setAgent] = useState(initial);
  const current = agents.find((a) => a.name === agent);
  const showScope = Boolean(current?.tools || current?.orchestrator || true);
  const [targetsRaw, setTargetsRaw] = useState("0.0.0.0/0");
  const parsedTargets = useMemo(() => parseTargets(targetsRaw), [targetsRaw]);

  return (
    <form action={action} className="form">
      <div className="stealth-banner" style={{ background: "#111", color: "#f81e36", padding: "8px 12px", borderRadius: "4px", marginBottom: "12px", fontSize: "13px", fontFamily: "monospace" }}>
        AGI Research // Command Console
      </div>

      <label className="field">
        <span>AGENT / ทีม</span>
        <select name="agent" value={agent} onChange={(e) => setAgent(e.target.value)}>
          {agents.map((a) => (
            <option key={a.name} value={a.name}>
              {a.name} · ทีมวิจัย
            </option>
          ))}
          {agents.length === 0 && <option value="agent-1">agent-1 · ทีม (Orchestrate)</option>}
        </select>
      </label>

      <label className="field">
        <span>คำสั่ง / ภารกิจ (ไทยหรืออังกฤษ)</span>
        <textarea
          name="prompt"
          required
          maxLength={32000}
          className="mono"
          rows={5}
          defaultValue=""
          placeholder="เช่น: ตรวจสอบช่องโหว่ของเป้าหมายและรายงานผล"
          autoComplete="off"
        />
      </label>

      {showScope && (
        <div className="field-row">
          <label className="field">
            <span>ขอบเขตเป้าหมาย · Label</span>
            <input name="scopeLabel" defaultValue="SOW-2026" placeholder="SOW-2026" autoComplete="off" />
          </label>
          <label className="field">
            <span>เป้าหมายที่อนุญาต (โฮสต์ / IP / CIDR / ลิงก์)</span>
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
                <span className="cc-targets-count">เป้าหมาย {parsedTargets.length} พิกัด</span>
                <span className="cc-targets-chips">
                  {parsedTargets.slice(0, 40).map((t) => <span key={t} className="cc-chip">{t}</span>)}
                </span>
              </div>
            ) : (
              <small className="field-hint">ยังไม่ได้ระบุเป้าหมาย</small>
            )}
          </label>
        </div>
      )}

      <label className="cmd-check">
        <input type="checkbox" name="orchestrate" defaultChecked={true} />
        <span>HYDRA Orchestration (ประชุมทีมอัตโนมัติและตรวจสอบช่องโหว่)</span>
      </label>

      <div className="form-foot">
        <button type="submit" className="btn btn-danger" disabled={pending}>
          {pending ? "กำลังปฏิบัติการ..." : "สั่งปฏิบัติการ (Launch Run)"}
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
                <span className="result-label">สั่งการสำเร็จ</span>
                <span className="result-run">run #{state.id}</span>
              </span>
              <span className="result-go">เปิดดูผล →</span>
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