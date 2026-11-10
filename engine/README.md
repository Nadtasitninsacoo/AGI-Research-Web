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

## DARK AGI: os_fingerprint / nse_scan / get_scan_job

เอเจนต์เรียก **nmap os-fingerprint** และ **NSE script scan** ของแพลตฟอร์ม
DARK AGI (พอร์ต 7411, แยกระบบ) ผ่าน REST `/jobs` โดยตรง — ไม่ผ่าน MCP
passthrough ทั่วไปเหมือน `dark-agi__*` tools อื่น เพื่อให้ตรวจ scope/allow-list
เองได้ก่อนส่งงาน (ดู `src/nmapGuard.mjs`, `src/darkAgiScanTools.mjs`)

**Tools ที่เอเจนต์เรียกได้**

| Tool | Input | พฤติกรรม |
|---|---|---|
| `os_fingerprint` | `targets: string[]`, `maxRate?: int` | ส่ง `nmap:os-fingerprint`, คืน `jobId` ทันที ไม่รอ approve |
| `nse_scan` | `targets: string[]`, `scripts: string[]`, `maxRate?: int` | ส่ง `nmap:script-scan`; `scripts` ต้องอยู่ใน allow-list เท่านั้น |
| `get_scan_job` | `jobId: string` | เช็คสถานะ 1 ครั้ง (ไม่ retry เอง); ถ้า `SUCCEEDED` จะ normalize + บันทึกผลลง DB |

**ก่อนส่งงานทุกครั้ง** (ทั้งสอง tool แรก):
1. `GET /engine` — ถ้า engine หยุดอยู่ (emergency-stop) จะไม่ส่งงาน
2. `GET /scopes` — เป้าหมายที่ไม่อยู่ใน Scope ที่เปิดอยู่จะถูกปฏิเสธ **ก่อน**
   ส่งงาน พร้อมบอกให้ไปสร้าง/แก้ scope เอง (`POST /scopes` ต้องใช้สิทธิ์
   `scopes:manage`) — เอเจนต์ไม่สร้าง/ขยาย scope ให้เองเด็ดขาด
3. `script` (เฉพาะ `nse_scan`) ต้องผ่าน allow-list ใน `nmapGuard.mjs`:
   ตัวอักษร/ตัวเลข/`-`/`_` เท่านั้น ห้าม path หรือไฟล์ `.lua` และห้ามหมวด
   `intrusive`/`brute`/`dos`/`exploit`/`fuzzer`/`vuln` — สคริปต์ที่ไม่ผ่านถูก
   ปฏิเสธทั้งคำขอ ไม่ส่งบางส่วน
4. `maxRate` ถูก clamp ไม่ให้เกิน `DARK_AGI_MAX_RATE_CAP`

ผลลัพธ์จาก `get_scan_job` (เมื่อ `SUCCEEDED`) จะถูก upsert ลงตาราง
`dark_agi_scan_results` (host, OS+accuracy, script id+output, jobId, เวลา) —
สร้างตารางด้วย `POST /api/db/init-tables` เหมือนตารางอื่นของโปรเจกต์

**401/403/422** จาก DARK AGI จะคืนข้อความอ่านเข้าใจได้ตรงๆ ไม่มีการ retry
อัตโนมัติ และ error ของ `-O` บน Windows ที่เกิดจากไม่มี Npcap/สิทธิ์
administrator จะถูกอธิบายสาเหตุตรงๆ แทนที่จะลองรันซ้ำ

**ตัวแปร env**

| ตัวแปร | ค่า default | ใช้ทำอะไร |
|---|---|---|
| `DARK_AGI_API_KEY` | (ว่าง = ปิดทั้งชุด) | API key ของ DARK AGI (ฝั่ง engine เท่านั้น ไม่ log ค่านี้) |
| `DARK_AGI_URL` | `http://127.0.0.1:7411/api/v1` | base URL ของ DARK AGI |
| `DARK_AGI_TIMEOUT_MS` | `30000` | timeout ต่อ 1 คำขอ HTTP |
| `DARK_AGI_MAX_RATE_CAP` | `1000` | เพดาน `--max-rate` ที่เอเจนต์ขอได้ (ไม่เกี่ยวกับ cap 10000 ของ DARK AGI เอง) |

**ตัวอย่างการเรียก** (จากโมเดล/เอเจนต์ ผ่าน tool-calling)

```json
{ "name": "os_fingerprint", "arguments": { "targets": ["10.0.0.5"], "maxRate": 300 } }
{ "name": "nse_scan", "arguments": { "targets": ["10.0.0.5"], "scripts": ["default", "safe"] } }
{ "name": "get_scan_job", "arguments": { "jobId": "..." } }
```

**ฝั่งเว็บ (มนุษย์)**: หน้า `/dark-agi` (DARK AGI Terminal) มีฟอร์มเฉพาะสำหรับ
`nmap:os-fingerprint` และ `nmap:script-scan` ใต้การ์ด Command Reference —
กรอก targets/maxRate/scripts (ตรวจ allow-list เดียวกันฝั่ง client ที่
`src/lib/dark-agi/nseAllowList.ts`) แล้วกดรันตรง ไม่ต้องพิมพ์ JSON เอง

**เทสต์**: `node --test engine/test/nmapGuard.test.mjs engine/test/darkAgiScanTools.test.mjs`
(mock HTTP/DB ทั้งหมด ไม่ต้องมี DARK AGI หรือ MySQL จริง) ครอบคลุม: scope ไม่
ผ่าน, รออนุมัติ, SUCCEEDED (+persist), FAILED (พร้อมคำอธิบาย Npcap), สถานะยัง
รันอยู่ (ไม่ retry เอง), script นอก allow-list ถูกปฏิเสธ, 401/403/422, engine
ถูก pause, และ DARK AGI ไม่ได้ตั้งค่า
