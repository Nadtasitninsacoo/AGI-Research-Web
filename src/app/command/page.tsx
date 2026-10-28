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

export const metadata = { title: "Command // AGI Research" };

export default function CommandPage() {
  return (
    <Shell label="LOADING COMMAND">
      <CommandContent />
    </Shell>
  );
}

async function CommandContent() {
  await connection();

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
        agent: (r.agent as string) ?? null,
        prompt: typeof p.prompt === "string" ? p.prompt : "",
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
      };
    });
  } catch {
    online = false;
  }

  return (
    <PageFrame title="COMMAND" online={online}>
      <PageHero
        kicker="AGI RESEARCH // COMMAND"
        title="Command"
        strong="Center"
        note={online ? `${agents.length} agents ready` : undefined}
      />

      <section className="panel span-12" id="engine">
        <header className="panel-head"><span>00 // ENGINE WORKER</span><em>ตัวประมวลผลงาน</em></header>
        <EngineControl />
        <p className="muted hint">ตัวนี้คือ worker ที่หยิบงานในคิวไปให้โมเดลทำ · ต้องเปิดค้างไว้ · ใช้ปุ่มนี้ หรือ terminal อย่างใดอย่างหนึ่ง อย่าเปิดซ้อนกัน</p>
        <AutoApproveToggle />
        <DbInitButton />
        <ApprovalsQueue />
      </section>

      <section className="panel span-12" id="sentinel">
        <header className="panel-head"><span>00b // SENTINEL — COUNTER-ATTACK MONITOR</span><em>เฝ้าระวัง + ตอบโต้ (ตั้งรับ)</em></header>
        <SecurityMonitor />
        <p className="muted hint">เฝ้าระวังสัญญาณถูกตีกลับ/ถูกยึดการควบคุม · ตรวจ scope block, forbidden ซ้ำ ๆ แล้วล็อกดาวน์เองได้ · ปุ่ม LOCKDOWN หยุดเอนจินทันที (หยุดตัวเอง ไม่ยิงกลับ)</p>
      </section>

      <section className="panel span-7" id="command">
        <header className="panel-head"><span>01 // ISSUE COMMAND</span><em>THAI / EN</em></header>
        {!online ? (
          <Notice>เชื่อมต่อฐานข้อมูลไม่ได้ — ตรวจ .env.local และ worker</Notice>
        ) : agents.length === 0 ? (
          <Notice>ยังไม่มีเอเจนต์ — รัน npm run seed-agents ก่อน</Notice>
        ) : (
          <CommandConsole agents={agents} />
        )}
      </section>

      <section className="panel span-5">
        <header className="panel-head"><span>02 // HOW IT WORKS</span><em>TEAM</em></header>
        <ol className="cmd-steps">
          <li><b>สั่งเป็นไทย</b> พิมพ์ภารกิจ เลือกทีม (HYDRA) หรือเอเจนต์เดี่ยว</li>
          <li><b>ประชุม + วางแผน</b> HYDRA แตกงานเป็นขั้น แล้วแบ่งให้ผู้เชี่ยวชาญ</li>
          <li><b>ลงมือ</b> ตัวที่เปิดเครื่องมือ (RECON-1) รันคำสั่งใต้ขอบเขตที่อนุญาต</li>
          <li><b>รวมผล</b> ดูผลแต่ละงานได้จากรายการด้านล่าง หรือหน้า RUNS</li>
        </ol>
        <p className="hint">ต้องการเลือกเป้าจากแผนที่? ไปที่หน้า <Link href="/map" className="link">MAP</Link></p>
      </section>

      <section className="panel span-12" id="fetch">
        <header className="panel-head"><span>03 // WEB FETCH GATEWAY</span><em>ดึงข้อมูลจากเน็ตผ่าน dashboard</em></header>
        <p className="muted hint">ปุ่มอิสระ: ให้เครื่องที่รันหน้าเว็บ (มีเน็ต) ไปดึงข้อมูลจากอินเทอร์เน็ตมาให้ แม้เครื่อง engine จะไม่มีเน็ต · แล้วคัดลอกไปใส่ในคำสั่ง HYDRA ได้</p>
        <WebFetchTool />
      </section>

      <section className="panel span-12" id="jobs">
        <header className="panel-head"><span>04 // งานที่สั่งล่าสุด</span><em>{jobs.length} JOBS</em></header>
        <JobsTable jobs={jobs} />
      </section>
    </PageFrame>
  );
}
