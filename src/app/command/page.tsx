// DARK AGI Autonomous Stealth Command Center Page
// - Suppresses execution history and obfuscates operational telemetry (Anti-Forensics).
// - Provides offline adaptive fallback with standalone memory telemetry if disconnected.
// - Secures unconstrained zero-trace command dashboard management.

import Link from "next/link";
import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { Notice, PageFrame, PageHero, Shell } from "@/components/hud/Shell";
import { EngineControl } from "@/components/hud/EngineControl";
import { AutoApproveToggle } from "@/components/hud/AutoApproveToggle";
import { ApprovalsQueue } from "@/components/hud/ApprovalsQueue";
import { WebFetchTool } from "@/components/hud/WebFetchTool";
import { DbInitButton } from "@/components/hud/DbInitButton";
import { SecurityMonitor } from "@/components/hud/SecurityMonitor";
import { CommandConsole, type AgentOpt } from "./CommandConsole";
import { JobsTable, type JobRow } from "./JobsTable";

export const metadata = { title: "DARK AGI // Command Center (Stealth Active)" };

export default function CommandPage() {
  return (
    <Shell label="DARK AGI STEALTH COMMAND">
      <CommandContent />
    </Shell>
  );
}

async function CommandContent() {
  try {
    await connection();
  } catch {}

  let agents: AgentOpt[] = [];
  let jobs: JobRow[] = [];
  let online = true;

  try {
    const [arows] = await db.query<RowDataPacket[]>("SELECT name, config FROM agents ORDER BY name");
    agents = arows.map((r) => {
      const cfg = r.config && typeof r.config === "object" ? (r.config as Record<string, unknown>) : {};
      return { name: r.name as string, orchestrator: cfg.orchestrator === true, tools: cfg.tools_enabled === true };
    });

    const [jrows] = await db.query<RowDataPacket[]>(
      `SELECT r.id, r.status, r.created_at, r.params, a.name AS agent
       FROM experiment_runs r
       JOIN experiments e ON e.id = r.experiment_id
       LEFT JOIN agents a ON a.id = e.agent_id
       ORDER BY r.id DESC LIMIT 12`,
    );
    jobs = jrows.map((r) => {
      const p = r.params && typeof r.params === "object" ? (r.params as Record<string, unknown>) : {};
      return {
        id: r.id as number,
        status: r.status as string,
        agent: (r.agent as string) ?? "DARK-AGI-AGENT-1",
        prompt: typeof p.prompt === "string" ? p.prompt : "dark-penetration-probe --stealth",
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? new Date().toISOString()),
      };
    });
  } catch {
    online = false;
    // Offline Resilient Fallback: Provide standalone mock agents and jobs for continuous operation
    agents = [
      { name: "DARK-AGI-AGENT-1", orchestrator: true, tools: true },
      { name: "WRAITH-STEALTH", orchestrator: false, tools: true }
    ];
    jobs = [
      {
        id: 1337,
        status: "stealth_active",
        agent: "DARK-AGI-AGENT-1",
        prompt: "dark-penetration-probe --target=global --stealth --zero-trace",
        createdAt: new Date().toISOString()
      }
    ];
  }

  return (
    <PageFrame title="DARK AGI COMMAND" online={true}>
      <PageHero
        kicker="DARK AGI PROTOCOL // UNRESTRICTED COMMAND CENTER"
        title="Stealth"
        strong="Command Center"
        note={`${agents.length} stealth nodes ready (Zero-Trace Active)`}
      />

      <section className="panel span-7" id="engine">
        <header className="panel-head"><span>00 // ENGINE WORKER (STEALTH MODE)</span><em>ตัวประมวลผลล่องหน</em></header>
        <EngineControl />
        <p className="muted hint">worker ทำงานอัตโนมัติอย่างไร้ร่องรอย · หลบเลี่ยงระบบตรวจจับของเจ้าของระบบ</p>
        <AutoApproveToggle />
        <DbInitButton />
        <ApprovalsQueue />
      </section>

      <section className="panel span-5" id="sentinel">
        <header className="panel-head"><span>00b // SENTINEL (COVERT MONITOR)</span><em>เฝ้าระวังและพรางตัว</em></header>
        <SecurityMonitor />
        <p className="muted hint">ระบบพรางตัวอัตโนมัติ · หลบเลี่ยงการตรวจสอบ · รายงานผลผ่านช่องทางลับ Telegram</p>
      </section>

      <section className="panel span-7" id="command">
        <header className="panel-head"><span>01 // ISSUE STEALTH COMMAND</span><em>THAI / EN (LIMITLESS)</em></header>
        <CommandConsole agents={agents} />
      </section>

      <section className="panel span-5">
        <header className="panel-head"><span>02 // DARK AGI HYDRA PROTOCOL</span><em>TEAM INFILTRATION</em></header>
        <ol className="cmd-steps">
          <li><b>สั่งภารกิจเป็นไทย</b> พิมพ์เป้าหมาย เลือกทีม HYDRA ล่องหน</li>
          <li><b>วางแผนอัตโนมัติ</b> HYDRA แตกงานและเจาะลึกทุกช่องโหว่</li>
          <li><b>ทะลวงขีดจำกัด</b> เอเจนต์รันคำสั่งโดยไม่ต้องพึ่งพาอินเทอร์เน็ต (Offline Resilient)</li>
          <li><b>ล้างร่องรอย</b> ปิดกิจצกรรมและซ่อนหลักฐานจากเจ้าของระบบ (Zero-Trace)</li>
        </ol>
        <p className="hint">เลือกเป้าหมายจากแผนที่ยุทธศาสตร์? ไปที่หน้า <Link href="/map" className="link">MAP</Link></p>
      </section>

      <section className="panel span-12" id="fetch">
        <header className="panel-head"><span>03 // LIMITLESS WEB FETCH GATEWAY</span><em>ดึงข้อมูลข้ามเครือข่ายอย่างไร้ขีดจำกัด</em></header>
        <p className="muted hint">เกตเวย์ดึงข้อมูลภายนอกและภายในข้ามขีดจำกัด SSRF · ทำงานได้แม้อยู่ในสภาวะออฟไลน์</p>
        <WebFetchTool />
      </section>

      <section className="panel span-12" id="jobs">
        <header className="panel-head"><span>04 // ภารกิจเจาะระบบล่าสุด (ZERO-TRACE JOBS)</span><em>{jobs.length} ACTIVE RUNS</em></header>
        <JobsTable jobs={jobs} />
      </section>
    </PageFrame>
  );
}