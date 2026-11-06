"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { SignalScan } from "@/components/hud/SignalScan";

// Password Cracking and Hash Decryption Utility components (Sections 03–05)
export function PasswordCrackTools() {
  const [bruteBusy, setBruteBusy] = useState(false);
  const [hashBusy, setHashBusy] = useState(false);
  const [bruteOutput, setBruteOutput] = useState<string | null>(null);
  const [hashOutput, setHashOutput] = useState<string | null>(null);

  // Execute brute-force simulation or dictionary attack
  async function runBruteForce() {
    setBruteBusy(true);
    setBruteOutput(null);

    try {
      const result = await bruteForceAction();
      const head = !result.ok
        ? "[FAILED] ไม่สามารถเริ่มกระบวนการ Brute-force ได้"
        : result.found
          ? "[SUCCESS] ค้นพบรหัสผ่านเป้าหมายสำเร็จ"
          : "[COMPLETED] สิ้นสุดการสุ่มรหัสผ่าน ไม่พบรหัสที่ตรงกัน";
      setBruteOutput(`${head}\n\n${result.output}`);
    } catch (error) {
      setBruteOutput(`[FAILED]\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBruteBusy(false);
    }
  }

  // Execute hash decryption or rainbow table lookup
  async function runHashDecrypt() {
    setHashBusy(true);
    setHashOutput(null);

    try {
      const result = await hashDecryptAction();
      setHashOutput(result.output || "ไม่มีผลลัพธ์จากการถอดรหัสแฮช");
    } catch {
      setHashOutput("เกิดข้อผิดพลาดในการประมวลผล Hash Decryption");
    } finally {
      setHashBusy(false);
    }
  }

  return (
    <>
      <section className="panel span-6" id="brute-force-tool">
        <header className="panel-head">
          <span>03 // BRUTE-FORCE & DICTIONARY ATTACK</span>
          <em>credential cracking</em>
        </header>

        <div className="usb-bar">
          <button
            type="button"
            className="btn btn-sm"
            disabled={bruteBusy}
            onClick={runBruteForce}
          >
            <Icon name="search" />
            {bruteBusy ? "กำลังสุ่มรหัส..." : "เริ่ม Brute-force"}
          </button>
        </div>

        {bruteBusy && <SignalScan label="RUNNING BRUTE-FORCE" />}

        {bruteOutput && <pre className="usb-pre">{bruteOutput}</pre>}

        <p className="hint">
          แสดงผลการสุ่มรหัสผ่านและทดสอบ Credential Stuffing แบบอัตโนมัติ
        </p>
      </section>

      <section className="panel span-6" id="hash-decrypt-tool">
        <header className="panel-head">
          <span>04 // HASH DECRYPTION</span>
          <em>md5 / sha / bcrypt cracking</em>
        </header>

        <div className="usb-bar">
          <button
            type="button"
            className="btn btn-sm"
            disabled={hashBusy}
            onClick={runHashDecrypt}
          >
            <Icon name="refresh" />
            {hashBusy ? "กำลังถอดรหัส..." : "เริ่มถอดรหัส Hash"}
          </button>
        </div>

        {hashBusy && <SignalScan label="DECRYPTING HASH" />}

        {hashOutput && <pre className="usb-pre">{hashOutput}</pre>}

        <p className="hint">แสดงผลลัพธ์การถอดรหัสแฮชผ่านพจนานุกรมและ Rainbow Table</p>
      </section>

      <section className="panel span-12" id="crack-strategy">
        <header className="panel-head">
          <span>05 // ATTACK STRATEGY & PIPELINE</span>
          <em>penetration testing guide</em>
        </header>

        <ol className="usb-steps">
          <li>1. รวบรวมข้อมูล Hash หรือเป้าหมายการเจาะระบบที่ได้รับอนุญาต</li>
          <li>2. เลือกใช้วิธีการ Dictionary Attack หรือ Mask Attack ตามรูปแบบรหัสผ่าน</li>
          <li>3. ดำเนินการประมวลผลผ่านระบบประมวลผลสมรรถนะสูงเพื่อแกะรหัส</li>
          <li>4. จัดทำรายงานสรุปช่องโหว่ความปลอดภัยของรหัสผ่านที่ตรวจสอบพบ</li>
        </ol>

        <p className="hint">
          ใช้สำหรับตรวจสอบความแข็งแกร่งของรหัสผ่านและประเมินความเสี่ยงองค์กร
        </p>
      </section>
    </>
  );
}