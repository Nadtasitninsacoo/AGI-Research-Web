"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { SignalScan } from "@/components/hud/SignalScan";

export type CrackingJobItem = {
  id: string;
  targetHash: string;
  algorithm: string;
  charset: string;
  maxLength: number;
  status: string;
  recoveredPassword: string | null;
  attempts: number;
  duration: number;
};

export function UsbLab() {
  const [targetHash, setTargetHash] = useState("");
  const [algorithm, setAlgorithm] = useState("SHA256");
  const [charset, setCharset] = useState("lower+numbers");
  const [maxLength, setMaxLength] = useState(4);

  const [cracking, setCracking] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Password Cracking Engine ready");
  const [history, setHistory] = useState<CrackingJobItem[]>([]);
  const [selectedJob, setSelectedJob] = useState<CrackingJobItem | null>(null);

  async function startCrackingJob() {
    const cleanHash = targetHash.trim();
    if (!cleanHash) {
      setStatusMsg("กรุณากรอก Target Hash ที่ต้องการตรวจสอบก่อนเริ่มกระบวนการแครก");
      return;
    }

    setCracking(true);
    setStatusMsg("กำลังประมวลผลการแครกและตรวจสอบแฮชเชิงโครงสร้าง...");

    try {
      // เรียกใช้งาน Server Action หรือ API สำหรับกระบวนการแครกรหัสผ่านจริง
      const response = await fetch("/api/crack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetHash: cleanHash,
          algorithm,
          charset,
          maxLength,
        }),
      });

      if (!response.ok) {
        throw new Error("ไม่สามารถเชื่อมต่อกับระบบประมวลผลการแครกได้");
      }

      const data = await response.json();

      const newJob: CrackingJobItem = {
        id: `job_${Date.now()}`,
        targetHash: cleanHash,
        algorithm,
        charset,
        maxLength,
        status: data.success ? "SUCCESS" : "FAILED",
        recoveredPassword: data.password ?? null,
        attempts: data.attempts ?? 0,
        duration: data.duration ?? 0,
      };

      setHistory((prev) => [newJob, ...prev]);
      setSelectedJob(newJob);
      setStatusMsg(data.success ? `[SUCCESS] กู้คืนรหัสผ่านสำเร็จ: ${data.password}` : "ไม่พบรหัสผ่านที่ตรงกับค่าแฮชเป้าหมายในเงื่อนไขที่กำหนด");
    } catch (error: unknown) {
      setStatusMsg(`เกิดข้อผิดพลาด: ${(error as Error).message}`);
    } finally {
      setCracking(false);
    }
  }

  return (
    <>
      {/* ส่วนควบคุมหลัก: Password Cracking & Hash Decryption Control Panel */}
      <section className="panel span-12" id="usb-scan">
        <header className="panel-head">
          <span>01 // Password Cracking & Hash Decryption Engine</span>
          <em>{cracking ? "กำลังประมวลผล..." : "พร้อมใช้งาน"}</em>
        </header>

        <p className="notice">
          ระบบเครื่องมือทางไซเบอร์เพื่อสุ่มรหัสผ่าน ถอดรหัสแฮช และตรวจสอบความปลอดภัยเชิงรุก (Brute-force / Dictionary Recovery Utility)
        </p>

        {/* ฟอร์มตั้งค่าพารามิเตอร์การแครก */}
        <div className="usb-bar" style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "10px 0" }}>
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontSize: "12px", color: "#ccc" }}>Target Hash / Encrypted String:</label>
            <input
              type="text"
              className="input-field"
              style={{ width: "100%", padding: "10px", background: "#111", color: "#0f0", border: "1px solid #333", fontFamily: "monospace" }}
              placeholder="วางค่าแฮชเป้าหมายที่ต้องการแครกที่นี่ (เช่น MD5, SHA256)..."
              value={targetHash}
              onChange={(e) => setTargetHash(e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: "10px" }}>
            <div>
              <label style={{ display: "block", marginBottom: "5px", fontSize: "12px", color: "#ccc" }}>Algorithm:</label>
              <select
                className="select-field"
                style={{ width: "100%", padding: "8px", background: "#111", color: "#fff", border: "1px solid #333" }}
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
                style={{ width: "100%", padding: "8px", background: "#111", color: "#fff", border: "1px solid #333" }}
                value={charset}
                onChange={(e) => setCharset(e.target.value)}
              >
                <option value="lower+numbers">Lowercase + Numbers (a-z, 0-9)</option>
                <option value="full-alpha">Full Alphanumeric (A-Z, a-z, 0-9)</option>
                <option value="symbols">Include Symbols (!@#$)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "5px", fontSize: "12px", color: "#ccc" }}>Max Length:</label>
              <input
                type="number"
                className="input-field"
                style={{ width: "100%", padding: "8px", background: "#111", color: "#fff", border: "1px solid #333" }}
                value={maxLength}
                onChange={(e) => setMaxLength(Number(e.target.value))}
                min={1}
                max={8}
              />
            </div>
          </div>

          <button
            type="button"
            className="btn btn-danger"
            disabled={cracking}
            onClick={startCrackingJob}
            style={{ padding: "12px", fontWeight: "bold", cursor: "pointer", marginTop: "5px" }}
          >
            <Icon name="refresh" />
            {cracking ? "กำลังดำเนินการแครกรหัสผ่าน..." : "เริ่มกระบวนการแครก / สุ่มรหัสผ่าน (Brute-force)"}
          </button>
        </div>

        {cracking ? (
          <SignalScan label="EXECUTING PASSWORD CRACKING ENGINE" note={statusMsg} />
        ) : (
          <p className="usb-msg" style={{ padding: "10px", background: "#151515", borderLeft: "3px solid #00ffcc", color: "#00ffcc" }}>
            {statusMsg}
          </p>
        )}

        {/* ตารางแสดงประวัติผลการแครก (Cracking Job History) */}
        {history.length > 0 && (
          <div className="table-scroll" style={{ marginTop: "15px" }}>
            <table className="grid-table usb-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Target Hash</th>
                  <th>Algorithm</th>
                  <th>Status</th>
                  <th>Recovered Password</th>
                  <th>Attempts</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {history.map((job) => (
                  <tr
                    key={job.id}
                    className={selectedJob?.id === job.id ? "is-sel" : ""}
                    onClick={() => setSelectedJob(job)}
                    style={{ cursor: "pointer" }}
                  >
                    <td className="usb-name">{job.id}</td>
                    <td className="usb-vid" style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {job.targetHash}
                    </td>
                    <td>{job.algorithm}</td>
                    <td>
                      {job.status === "SUCCESS" ? (
                        <span className="usb-ok" style={{ color: "#00ff00" }}>● SUCCESS</span>
                      ) : (
                        <span className="usb-bad" style={{ color: "#ff4444" }}>● FAILED</span>
                      )}
                    </td>
                    <td style={{ color: "#00ffcc", fontWeight: "bold" }}>{job.recoveredPassword || "—"}</td>
                    <td>{job.attempts.toLocaleString()}</td>
                    <td className="muted">{job.duration.toFixed(2)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="hint">
          ระบบประมวลผลการแครกรหัสผ่านและตรวจสอบค่าแฮชเชิงโครงสร้าง · พร้อมเก็บบันทึกประวัติการทดสอบ
        </p>
      </section>

      {/* ส่วนแสดงรายละเอียดงานแครกที่เลือก (Selected Cracking Job Detail) */}
      {selectedJob && (
        <section className="panel span-12" id="usb-detail" style={{ marginTop: "20px" }}>
          <header className="panel-head">
            <span>02 // รายละเอียดผลลัพธ์การแครก · {selectedJob.id}</span>
            <em>{selectedJob.algorithm}</em>
          </header>

          <div className="usb-idrow" style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "15px" }}>
            <code className="usb-idval" style={{ flex: 1, padding: "10px", background: "#111", color: "#00ff00" }}>
              Target: {selectedJob.targetHash}
            </code>
          </div>

          <div style={{ background: "#151515", padding: "15px", borderRadius: "6px", fontFamily: "monospace" }}>
            <p style={{ color: "#aaa", marginBottom: "8px" }}>&gt; สถานะการกู้คืนรหัสผ่าน:</p>
            <p style={{ color: selectedJob.recoveredPassword ? "#00ff00" : "#ff4444", fontSize: "16px", fontWeight: "bold" }}>
              {selectedJob.recoveredPassword ? `รหัสผ่านที่ถอดได้: [ ${selectedJob.recoveredPassword} ]` : "ไม่พบรหัสผ่านในเงื่อนไขการค้นหาปัจจุบัน"}
            </p>
            <div style={{ marginTop: "12px", borderTop: "1px solid #333", paddingTop: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "12px", color: "#ccc" }}>
              <div>จำนวนครั้งที่ทดสอบ (Attempts): <strong>{selectedJob.attempts.toLocaleString()}</strong></div>
              <div>เวลาที่ใช้ประมวลผล (Duration): <strong>{selectedJob.duration.toFixed(2)} วินาที</strong></div>
              <div>รูปแบบชุดตัวอักษร (Charset): <strong>{selectedJob.charset}</strong></div>
              <div>ความยาวสูงสุด (Max Length): <strong>{selectedJob.maxLength}</strong></div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}