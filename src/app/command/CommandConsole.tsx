"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { launchCommandAction } from "./actions";
import { Icon } from "@/components/Icon";
import { parseTargets } from "@/lib/targets";

export type AgentOpt = { name: string; orchestrator: boolean; tools: boolean };

export function CommandConsole({ agents }: { agents: AgentOpt[] }) {
  const [state, action, pending] = useActionState(launchCommandAction, null);
  const initial = agents.find((a) => a.orchestrator)?.name ?? agents[0]?.name ?? "";
  const [agent, setAgent] = useState(initial);
  const current = agents.find((a) => a.name === agent);
  const showScope = Boolean(current?.tools || current?.orchestrator);
  const [targetsRaw, setTargetsRaw] = useState("");
  const parsedTargets = useMemo(() => parseTargets(targetsRaw), [targetsRaw]);

  return (
    <form action={action} className="form">
      <label className="field">
        <span>AGENT / ทีม</span>
        <select name="agent" value={agent} onChange={(e) => setAgent(e.target.value)}>
          {agents.map((a) => (
            <option key={a.name} value={a.name}>
              {a.name}
              {a.orchestrator ? "  ·  ทีม (orchestrate)" : a.tools ? "  ·  ใช้เครื่องมือ" : "  ·  ข้อความ"}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>คำสั่ง / ภารกิจ (ไทยหรืออังกฤษ)</span>
        <textarea
          name="prompt"
          required
          maxLength={8000}
          className="mono"
          rows={5}
          placeholder="เช่น: ประเมินความปลอดภัยเว็บแอป app.lab.local เป็น 3 เฟส แล้วสรุปช่องโหว่ที่เจอ"
          autoComplete="off"
        />
      </label>

      {showScope && (
        <div className="field-row">
          <label className="field">
            <span>ขอบเขต · label (ไม่บังคับ)</span>
            <input name="scopeLabel" placeholder="SOW-2026-014" autoComplete="off" />
          </label>
          <label className="field">
            <span>เป้าหมายที่อนุญาต (โฮสต์ / IP / CIDR / ลิงก์ — หลายตัว คั่นด้วยอะไรก็ได้)</span>
            <textarea
              name="scopeTargets"
              className="mono cc-targets"
              rows={3}
              value={targetsRaw}
              onChange={(e) => setTargetsRaw(e.target.value)}
              placeholder={"วางหลายไอพีได้เลย ไม่ต้องใส่คอมมา เช่น\n8.8.8.8 1.1.1.1 10.10.10.0/24\napp.lab.local  https://x.lab.local/login"}
              autoComplete="off"
            />
            {parsedTargets.length > 0 ? (
              <div className="cc-targets-preview">
                <span className="cc-targets-count">ระบบแยกได้ {parsedTargets.length} เป้าหมาย</span>
                <span className="cc-targets-chips">
                  {parsedTargets.slice(0, 40).map((t) => <span key={t} className="cc-chip">{t}</span>)}
                  {parsedTargets.length > 40 && <span className="cc-chip cc-chip-more">+{parsedTargets.length - 40}</span>}
                </span>
              </div>
            ) : (
              <small className="field-hint">คั่นด้วยเว้นวรรค ขึ้นบรรทัดใหม่ , ; หรือ | ก็ได้ · วางลิงก์ได้ ระบบดึงเฉพาะโฮสต์ · ระบบตัดคำที่ไม่ใช่เป้าหมายออกให้</small>
            )}
          </label>
        </div>
      )}

      <label className="cmd-check">
        <input type="checkbox" name="orchestrate" defaultChecked={current?.orchestrator} />
        <span>ประชุมทีมก่อนลงมือ (orchestrate) — HYDRA วางแผนแล้วแบ่งงาน</span>
      </label>

      <div className="form-foot">
        <button type="submit" className="btn btn-danger" disabled={pending}>
          {pending ? "กำลังส่ง..." : "สั่งงาน"}
        </button>
        <Link href="/map" className="btn btn-ghost">เลือกเป้าจากแผนที่ →</Link>
        {state &&
          (state.ok && state.id ? (
            <Link
              href={`/runs/${state.id}`}
              className="btn btn-success result-btn"
              role="status"
            >
              <span className="result-check" aria-hidden="true"><Icon name="check" /></span>
              <span className="result-body">
                <span className="result-label">สั่งงานแล้ว</span>
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
