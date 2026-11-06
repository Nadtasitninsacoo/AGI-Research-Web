"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard access may be unavailable in insecure contexts.
  }
}

export type CrackingDevice = {
  name: string;
  vidpid: string | null;
  instanceId: string;
};

export type CrackingProp = {
  key: string;
  value: string;
};

// Section: Password Cracking & Hash Decryption Control Panel
export function UsbDeviceDetail({
  device,
  props,
  inspecting,
  inspectMsg,
}: {
  device: CrackingDevice;
  props: CrackingProp[] | null;
  inspecting: boolean;
  inspectMsg: string;
}) {
  const [targetHash, setTargetHash] = useState("");
  const [algorithm, setAlgorithm] = useState("SHA256");
  const [charset, setCharset] = useState("lower+numbers");
  const [maxLength, setMaxLength] = useState(4);
  const [isCracking, setIsCracking] = useState(false);
  const [crackResult, setCrackResult] = useState<string | null>(null);

  async function handleStartCracking() {
    if (!targetHash.trim()) {
      alert("กรุณากรอก Target Hash ที่ต้องการตรวจสอบ");
      return;
    }

    setIsCracking(true);
    setCrackResult(null);

    try {
      // จำลองการเรียกใช้งาน Server Action สำหรับการแครกรหัสผ่านจริง
      const response = await fetch("/api/crack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetHash, algorithm, charset, maxLength }),
      });

      if (!response.ok) {
        throw new Error("เกิดข้อผิดพลาดในการประมวลผลการแครก");
      }

      const data = await response.json();
      setCrackResult(JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      setCrackResult(JSON.stringify({ error: (error as Error).message }, null, 2));
    } finally {
      setIsCracking(false);
    }
  }

  return (
    <section className="panel span-12" id="usb-detail">
      <header className="panel-head">
        <span>02 // Password Cracking & Hash Decryption Engine · {device.name || "Target System"}</span>
        <em>{algorithm}</em>
      </header>

      <div className="usb-idrow" style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "15px" }}>
        <code className="usb-idval" style={{ flex: 1, padding: "8px", background: "#111", color: "#0f0" }}>
          {device.instanceId || "CRACK_TARGET_NODE_01"}
        </code>
        <button
          type="button"
          className="lf-mini"
          onClick={() => copyText(device.instanceId)}
        >
          <Icon name="copy" />
          คัดลอก Node ID
        </button>
      </div>

      {/* Password Cracking Parameters Configuration Form */}
      <div className="cracking-config" style={{ display: "flex", flexDirection: "column", gap: "12px", background: "#1a1a1a", padding: "15px", borderRadius: "6px", marginBottom: "15px" }}>
        <div>
          <label style={{ display: "block", marginBottom: "5px", fontSize: "12px", color: "#ccc" }}>Target Hash / Encrypted String:</label>
          <input
            type="text"
            className="input-field"
            style={{ width: "100%", padding: "8px", background: "#222", color: "#fff", border: "1px solid #444" }}
            placeholder="วางค่าแฮชเป้าหมายที่นี่ (เช่น SHA256 / MD5)..."
            value={targetHash}
            onChange={(e) => setTargetHash(e.target.value)}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: "10px" }}>
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontSize: "12px", color: "#ccc" }}>Algorithm:</label>
            <select
              className="select-field"
              style={{ width: "100%", padding: "6px", background: "#222", color: "#fff", border: "1px solid #444" }}
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value)}
            >
              <option value="MD5">MD5</option>
              <option value="SHA1">SHA1</option>
              <option value="SHA256">SHA256</option>
              <option value="SHA512">SHA512</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "5px", fontSize: "12px", color: "#ccc" }}>Character Set:</label>
            <select
              className="select-field"
              style={{ width: "100%", padding: "6px", background: "#222", color: "#fff", border: "1px solid #444" }}
              value={charset}
              onChange={(e) => setCharset(e.target.value)}
            >
              <option value="lower+numbers">Lowercase + Numbers</option>
              <option value="full-alpha">Full Alphanumeric</option>
              <option value="symbols">Include Symbols</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "5px", fontSize: "12px", color: "#ccc" }}>Max Length:</label>
            <input
              type="number"
              className="input-field"
              style={{ width: "100%", padding: "6px", background: "#222", color: "#fff", border: "1px solid #444" }}
              value={maxLength}
              onChange={(e) => setMaxLength(Number(e.target.value))}
              min={1}
              max={8}
            />
          </div>
        </div>

        <button
          type="button"
          className="btn btn-sm"
          disabled={isCracking}
          onClick={handleStartCracking}
          style={{ padding: "10px", background: "#0070f3", color: "#fff", fontWeight: "bold", cursor: "pointer", border: "none", borderRadius: "4px" }}
        >
          <Icon name="search" /> {isCracking ? "กำลังดำเนินการแครกรหัสผ่าน..." : "เริ่มกระบวนการแครก / ถอดรหัส (Brute-force)"}
        </button>
      </div>

      {/* Results / Execution Output Display */}
      {isCracking ? (
        <div style={{ padding: "20px", textAlign: "center", color: "#00ffcc" }}>กำลังประมวลผลการคำนวณแฮชผ่านระบบหลังบ้าน...</div>
      ) : crackResult ? (
        <div className="table-scroll" style={{ marginTop: "10px" }}>
          <span style={{ fontSize: "12px", color: "#888", display: "block", marginBottom: "5px" }}>Cracking Result & Metrics:</span>
          <pre className="usb-pre" style={{ background: "#0a0a0a", color: "#00ff00", padding: "12px", borderRadius: "4px", overflowX: "auto" }}>
            {crackResult}
          </pre>
        </div>
      ) : (
        <p className="muted" style={{ color: "#777" }}>{inspectMsg || "พร้อมรับค่าแฮชและพารามิเตอร์เพื่อเริ่มกระบวนการถอดรหัส"}</p>
      )}

      {/* Command Utility Reference */}
      <div className="usb-attach" style={{ marginTop: "15px", borderTop: "1px solid #333", paddingTop: "10px" }}>
        <span className="usb-attach-h" style={{ fontSize: "12px", color: "#aaa" }}>คำสั่งอ้างอิงสำหรับเครื่องมือไซเบอร์ (CLI Utility):</span>
        <pre className="usb-pre" style={{ background: "#111", color: "#ffaa00", padding: "8px", fontSize: "11px" }}>
          {`# Target Hash Verification Engine Active\npowershell -Command "Invoke-PasswordCracking -Algorithm ${algorithm} -MaxLen ${maxLength}"`}
        </pre>
        <button
          type="button"
          className="btn btn-sm"
          style={{ marginTop: "5px" }}
          onClick={() => copyText(`powershell -Command "Invoke-PasswordCracking -Algorithm ${algorithm} -MaxLen ${maxLength}"`)}
        >
          <Icon name="copy" />
          คัดลอกคำสั่ง CLI
        </button>
      </div>
    </section>
  );
}