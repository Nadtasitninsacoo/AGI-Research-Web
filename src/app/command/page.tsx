// Command Center page
// - Shows execution history and operational telemetry.
// - Provides an in-memory fallback when the database is unavailable.

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

export const metadata = { title: "Command Center" };

export default function CommandPage() {
  return (
    <Shell label="COMMAND">
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
        agent: (r.agent as string) ?? "agent-1",
        prompt: typeof p.prompt === "string" ? p.prompt : "",
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? new Date().toISOString()),
      };
    });
  } catch {
    online = false;
    // Fallback: provide mock agents and jobs when the database is offline.
    agents = [
      { name: "agent-1", orchestrator: true, tools: true },
      { name: "agent-2", orchestrator: false, tools: true }
    ];
    jobs = [
      {
        id: 1337,
        status: "active",
        agent: "agent-1",
        prompt: "",
        createdAt: new Date().toISOString()
      }
    ];
  }

  return (
    <PageFrame title="COMMAND" online={true}>
      <PageHero
        kicker="AGI RESEARCH // COMMAND CENTER"
        title="Command"
        strong="Command Center"
        note={`${agents.length} nodes ready`}
      />

      <section className="panel span-7" id="engine">
        <header className="panel-head"><span>00 // ENGINE WORKER</span><em>ตัวประมวลผล</em></header>
        <EngineControl />
        <p className="muted hint">worker ทำงานอัตโนมัติ · ประมวลผลงานในคิว</p>
        <AutoApproveToggle />
        <DbInitButton />
        <ApprovalsQueue />
      </section>

      <section className="panel span-5" id="sentinel">
        <header className="panel-head"><span>00b // SENTINEL (MONITOR)</span><em>เฝ้าระวัง</em></header>
        <SecurityMonitor />
        <p className="muted hint">ระบบเฝ้าระวังอัตโนมัติ · รายงานผลผ่าน Telegram</p>
      </section>

      <section className="panel span-7" id="command">
        <header className="panel-head"><span>01 // ISSUE COMMAND</span><em>THAI / EN</em></header>
        <CommandConsole agents={agents} />
      </section>

      <section className="panel span-5">
        <header className="panel-head"><span>02 // TEAM MODE</span><em>TEAM</em></header>
        <ol className="cmd-steps">
          <li><b>สั่งภารกิจเป็นไทย</b> พิมพ์เป้าหมาย เลือกทีม HYDRA</li>
          <li><b>วางแผนอัตโนมัติ</b> HYDRA แตกงานและตรวจสอบช่องโหว่</li>
          <li><b>ประมวลผล</b> เอเจนต์รันคำสั่งได้แม้อยู่ในสภาวะออฟไลน์ (Offline Resilient)</li>
          <li><b>รายงานผล</b> สรุปผลและบันทึกไว้ในระบบ</li>
        </ol>
        <p className="hint">เลือกเป้าหมายจากแผนที่ยุทธศาสตร์? ไปที่หน้า <Link href="/map" className="link">MAP</Link></p>
      </section>

      <section className="panel span-12" id="fetch">
        <header className="panel-head"><span>03 // WEB FETCH</span><em>ดึงข้อมูลข้ามเครือข่าย</em></header>
        <p className="muted hint">เกตเวย์ดึงข้อมูลภายนอกและภายใน · ทำงานได้แม้อยู่ในสภาวะออฟไลน์</p>
        <WebFetchTool />
      </section>

      <section className="panel span-12" id="jobs">
        <header className="panel-head"><span>04 // งานล่าสุด</span><em>{jobs.length} ACTIVE RUNS</em></header>
        <JobsTable jobs={jobs} />
      </section>
    </PageFrame>
  );
}