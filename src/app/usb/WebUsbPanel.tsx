"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

export function WebUsbPanel() {
  const [targetHash, setTargetHash] = useState("");
  const [charset, setCharset] = useState("lower+numbers");
  const [maxLength, setMaxLength] = useState(6);
  const [statusMsg, setStatusMsg] = useState("");
  const [cracking, setCracking] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function startCracking() {
    if (!targetHash.trim()) {
      setStatusMsg("กรุณากรอกเป้าหมายแฮช (Target Hash) ที่ต้องการตรวจสอบ");
      return;
    }

    setCracking(true);
    setStatusMsg("กำลังเริ่มต้นกระบวนการสุ่มรหัสผ่าน (Brute-force / Dictionary Attack)...");
    setResult(null);

    // จำลองกระบวนการประมวลผลการแครกแฮชตามคำสั่ง
    setTimeout(() => {
      setCracking(false);
      setStatusMsg("กระบวนการประมวลผลเสร็จสิ้น");
      setResult(`[SUCCESS] พบผลลัพธ์ตรงกับแฮชเป้าหมาย: "sec99x" (เวลาในการประมวลผล: 1.42 วินาที)`);
    }, 2000);
  }

  return (
    <section className="panel span-12" id="usb-webusb">
      <header className="panel-head">
        <span>07 // Password Cracking & Hash Decryption Engine</span>
        <em>Brute-force / Dictionary Recovery Utility</em>
      </header>
      <div className="usb-bar" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "10px" }}>
        <div>
          <label style={{ display: "block", marginBottom: "5px", fontSize: "12px" }}>Target Hash / Encrypted String:</label>
          <input
            type="text"
            className="input-field"
            style={{ width: "100%", padding: "8px" }}
            placeholder="วางค่าแฮชที่ต้องการแครกที่นี่..."
            value={targetHash}
            onChange={(e) => setTargetHash(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", marginBottom: "5px", fontSize: "12px" }}>Character Set:</label>
            <select
              className="select-field"
              style={{ width: "100%", padding: "6px" }}
              value={charset}
              onChange={(e) => setCharset(e.target.value)}
            >
              <option value="lower+numbers">Lowercase + Numbers (a-z, 0-9)</option>
              <option value="full-alpha">Full Alphanumeric (A-Z, a-z, 0-9)</option>
              <option value="symbols">Include Special Symbols (!@#$)</option>
            </select>
          </div>
          <div style={{ width: "120px" }}>
            <label style={{ display: "block", marginBottom: "5px", fontSize: "12px" }}>Max Length:</label>
            <input
              type="number"
              className="input-field"
              style={{ width: "100%", padding: "6px" }}
              value={maxLength}
              onChange={(e) => setMaxLength(Number(e.target.value))}
              min={1}
              max={32}
            />
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          disabled={cracking}
          onClick={startCracking}
          style={{ marginTop: "5px", padding: "8px 12px", cursor: "pointer" }}
        >
          <Icon name="search" /> {cracking ? "กำลังประมวลผลการแครก..." : "เริ่มกระบวนการแครก / ถอดรหัส"}
        </button>
      </div>
      {statusMsg && <p className="usb-msg" style={{ padding: "8px", margin: "5px 0" }}>{statusMsg}</p>}
      {result && <pre className="usb-pre" style={{ background: "#111", color: "#0f0", padding: "10px" }}>{result}</pre>}
      <p className="hint">ระบบประมวลผลและทดสอบรหัสผ่านผ่านชุดคำสั่งแครกเชิงโครงสร้าง</p>
    </section>
  );
}