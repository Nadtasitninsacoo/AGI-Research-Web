# AGI Engine — security agent worker

เอนจินของเอเจนต์ ทำงานเป็น **Node worker แยก** ต่อ **Ollama (Llama)** และดึงงานจาก
MySQL มารัน แล้วเขียน log/ผลลัพธ์กลับไปให้แดชบอร์ด (`/runs/[id]`) แสดง
ไม่แตะ backend NestJS เดิม — คุยกับ MySQL ตรงๆ อย่างเดียว

> ออกแบบสำหรับงาน **pentest ที่ได้รับอนุญาตตามสัญญา (SOW/ROE)** เท่านั้น
> เอเจนต์ทำงานได้เฉพาะเป้าหมายที่อยู่ใน scope และมีด่านกันคำสั่งอันตรายเสมอ

## โครงสร้าง

| ไฟล์ | หน้าที่ |
|---|---|
| `src/index.mjs` | worker: poll งาน `queued` → claim → รัน → อัปเดตผล |
| `src/agentLoop.mjs` | วงจรคิด: โมเดล ⇄ เครื่องมือ บังคับ scope+policy ทุกคำสั่ง |
| `src/ollama.mjs` | client คุยกับ Ollama (`/api/chat`) รองรับ tool-calling |
| `src/systemPrompt.mjs` | system prompt ผู้เชี่ยวชาญ pentest ที่ยึดขอบเขต |
| `src/scope.mjs` | บังคับ Rules of Engagement — ยิงได้เฉพาะโฮสต์ในสัญญา |
| `src/policy.mjs` | จัดระดับคำสั่ง recon/active/intrusive/forbidden + ด่านอนุมัติ |
| `src/shell.mjs` | รันคำสั่งจริง: PowerShell / CMD / bash / **wsl** (Kali) + timeout |
| `src/logger.mjs` | log ลง `agent_logs` + คอนโซล |
| `src/db.mjs` / `src/config.mjs` | pool MySQL / ค่าตั้งจาก env |

## ความต้องการ

- Node 18+ (ใช้ `fetch` และ `--env-file` ในตัว)
- `mysql2` — ใช้ร่วมจาก `node_modules` ของโปรเจกต์ (เอนจินไม่มี dependency ของตัวเอง)
- [Ollama](https://ollama.com) ติดตั้งและดึงโมเดลไว้ เช่น `ollama pull llama3.1`
- (ถ้าใช้เครื่องมือ Kali/Linux) WSL พร้อม bash — เอเจนต์เรียกผ่าน shell `wsl`

## เริ่มใช้งาน

```bash
# 1) ตั้งค่า env (ใช้ร่วมกับเว็บได้เลย)
cp engine/.env.example .env.local   # แล้วแก้รหัส MySQL ให้ถูก

# 2) รัน worker
node --env-file=.env.local engine/src/index.mjs
```

เมื่อหน้า `/experiments` กด **RUN** จะเกิดแถว `experiment_runs` สถานะ `queued`
worker จะ claim มารันแล้วอัปเดตเป็น `running` → `succeeded`/`failed` พร้อม log สด

## การตั้งขอบเขต (scope) — จำเป็น

ใส่ scope ไว้ที่คอลัมน์ JSON `agents.config` ของเอเจนต์ หรือใน `params` ของ run:

```json
{
  "scope": {
    "label": "ACME web app pentest (SOW-2026-014)",
    "targets": ["10.10.10.0/24", "app.client.example", "*.lab.local"]
  }
}
```

- รองรับ IP, CIDR, hostname, และ wildcard โดเมน (`*.lab.local`)
- คำสั่งที่อ้างถึงเป้าหมาย **นอก scope** จะถูกปฏิเสธก่อนถึง shell
- คำสั่ง local ล้วน (เช่น `whoami`) ไม่มีเป้าหมายเครือข่าย ทำได้ปกติ

## ระดับคำสั่งและการอนุมัติ

| ระดับ | ตัวอย่าง | พฤติกรรม |
|---|---|---|
| recon | `whoami`, `dig`, `nmap -sV` | รันได้ (ใน scope) + log |
| active | `nmap`, `gobuster`, `enum4linux` | รันได้ (ใน scope) + log |
| intrusive | `sqlmap --dump`, `hydra`, `msfconsole` | **ต้องอนุมัติ** ก่อน |
| forbidden | ลบไฟล์ระบบ, DoS/flood, ยิงทั้งอินเทอร์เน็ต, ล้าง log | **ปฏิเสธเสมอ** |

อนุมัติคำสั่ง intrusive: เพิ่ม token (เช่น ชื่อเครื่องมือหรือเลขตั๋ว) ลงใน
`config.approvedActions` ของเอเจนต์ หรือ `params.approvedActions` ของ run
ถ้าคำสั่งมี token นั้นเป็นส่วนหนึ่ง จะรันได้

> ด่านพวกนี้เป็น safety net สำหรับงานที่ได้รับอนุญาต ไม่ใช่ sandbox สมบูรณ์
> และถูกออกแบบให้ **ถอดไม่ได้** จากตัวเอนจิน

## การเพิ่มเครื่องมือใหม่

เพิ่ม tool definition ใน `TOOLS` (ไฟล์ `agentLoop.mjs`) และเขียน handler
เครื่องมือที่รันคำสั่งควรผ่าน `checkScope` + `decide` + `runCommand` เหมือน
`run_command` เพื่อให้ guardrail ครอบคลุม
