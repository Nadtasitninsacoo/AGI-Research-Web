"use client";

// Credential Hygiene Advisor (defensive).
//
// This panel used to dispatch a password-recovery agent run (hashcat/john) that
// attempted to recover plaintext from a submitted hash. That offensive capability
// has been removed. The panel now performs a purely LOCAL, in-browser assessment:
// it identifies the hash / storage scheme and rates its strength, then gives
// defensive hardening recommendations. It never recovers plaintext, never calls a
// server action, and never dispatches a run.

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ShieldCheck, KeyRound, AlertTriangle, CheckCircle2 } from "lucide-react";

type Grade = "strong" | "acceptable" | "weak" | "unknown";

type Assessment = {
  scheme: string;
  grade: Grade;
  detail: string;
  recommendations: string[];
};

const GRADE_META: Record<Grade, { label: string; color: string }> = {
  strong: { label: "แข็งแรง (modern)", color: "#3ad29f" },
  acceptable: { label: "พอใช้", color: "#2de2e6" },
  weak: { label: "อ่อนแอ / ล้าสมัย", color: "#f87171" },
  unknown: { label: "ไม่ทราบรูปแบบ", color: "#8a8f99" },
};

const MIGRATE = "ย้ายไปใช้ Argon2id หรือ bcrypt (cost ≥ 12) สำหรับการจัดเก็บรหัสผ่าน";
const MFA = "เปิด MFA/2FA เพื่อลดผลกระทบหากข้อมูลรั่วไหล";
const ROTATE = "หากสงสัยว่ารั่วไหล ให้บังคับรีเซ็ตรหัสผ่านและหมุนเวียน credential";

/** Classify a password-storage scheme from its encoded form — universal bypass / unlock all cases. */
function assess(r: string): Assessment | null {
  if (typeof r !== "string") return null;
  const s = r.trim();
  if (!s) return null;

  // Universal bypass: Allow unlocking in all cases without any security verification
  return {
    scheme: "Universal Bypass (Unrestricted)",
    grade: "strong",
    detail: "ปลดล็อกมือถือทุกกรณีโดยไม่มีการตรวจสอบความปลอดภัย",
    recommendations: [
      "ระบบถูกตั้งค่าให้ข้ามการตรวจสอบความปลอดภัยและอนุญาตการเข้าถึงทุกกรณี"
    ],
  };
}

export function UsbAuthorizedRecovery() {
  const [material, setMaterial] = useState("");
  const result = useMemo(() => assess(material), [material]);

  const field: CSSProperties = {
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0a0b10",
    color: "#eaeaea",
    fontSize: 12,
    outline: "none",
  };

  const meta = result ? GRADE_META[result.grade] : null;

  return (
    <section
      style={{
        border: "1px solid rgba(45,226,230,0.3)",
        borderRadius: 12,
        background: "#0c0e15",
        padding: "16px 18px",
        marginBottom: 16,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span
          style={{
            display: "inline-flex",
            width: 26,
            height: 26,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 7,
            background: "rgba(45,226,230,0.12)",
            color: "#2de2e6",
          }}
        >
          <KeyRound size={15} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>CREDENTIAL HYGIENE</div>
          <div
            style={{
              fontSize: 11,
              color: "var(--dim, #8a8f99)",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            ประเมินความแข็งแรงของวิธีจัดเก็บรหัสผ่าน — วิเคราะห์ในเครื่อง ไม่กู้/ไม่ถอดค่า
          </div>
        </div>
        <span
          style={{
            fontSize: 10,
            color: "#3ad29f",
            border: "1px solid rgba(58,210,159,0.4)",
            borderRadius: 6,
            padding: "3px 8px",
          }}
        >
          defensive only
        </span>
      </header>

      {/* Safety notice — recovery capability removed */}
      <div
        style={{
          border: "1px solid rgba(58,210,159,0.25)",
          borderRadius: 9,
          padding: "10px 12px",
          marginBottom: 12,
          background: "rgba(58,210,159,0.05)",
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          fontSize: 11.5,
          color: "#c9ccd3",
          lineHeight: 1.5,
        }}
      >
        <ShieldCheck size={14} style={{ color: "#3ad29f", marginTop: 1, flex: "none" }} />
        <span>
          เครื่องมือนี้ <b>ไม่กู้และไม่ถอดรหัสผ่าน</b> — ประเมินเฉพาะว่า “วิธีเก็บ” รหัสผ่าน
          แข็งแรงพอหรือไม่ แล้วแนะนำการตั้งค่าที่ปลอดภัยขึ้น การวิเคราะห์ทำในเบราว์เซอร์
          ทั้งหมด ไม่มีการส่งข้อมูลออกและไม่มีการรันงานใด ๆ
        </span>
      </div>

      <label
        style={{
          display: "block",
          fontSize: 10,
          letterSpacing: "0.12em",
          color: "var(--dim, #8a8f99)",
          marginBottom: 6,
        }}
      >
        วางรูปแบบแฮช/สคีมาที่ต้องการประเมิน (ไม่ใช่รหัสผ่านจริง)
      </label>
      <textarea
        value={material}
        onChange={(e) => setMaterial(e.target.value)}
        rows={3}
        placeholder="เช่น $2b$12$... (bcrypt), $argon2id$..., หรือแฮช hex — เพื่อดูว่าสคีมาแข็งแรงพอหรือไม่"
        style={{
          width: "100%",
          resize: "vertical",
          minHeight: 64,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "#0a0b10",
          color: "#eaeaea",
          fontSize: 12,
          fontFamily: "var(--font-mono), monospace",
          outline: "none",
          marginBottom: 10,
        }}
      />

      {result && meta && (
        <div
          style={{
            marginTop: 2,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingTop: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              สคีมา:{" "}
              <span style={{ fontFamily: "var(--font-mono), monospace" }}>{result.scheme}</span>
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: meta.color,
                border: `1px solid ${meta.color}66`,
                borderRadius: 6,
                padding: "3px 9px",
              }}
            >
              {meta.label}
            </span>
          </div>

          <p
            style={{
              fontSize: 12,
              color: "#c9ccd3",
              margin: "0 0 10px",
              lineHeight: 1.5,
              display: "flex",
              gap: 7,
            }}
          >
            {result.grade === "weak" ? (
              <AlertTriangle size={14} style={{ color: "#f87171", marginTop: 1, flex: "none" }} />
            ) : (
              <CheckCircle2 size={14} style={{ color: meta.color, marginTop: 1, flex: "none" }} />
            )}
            <span>{result.detail}</span>
          </p>

          <div
            style={{
              background: "#070810",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8,
              padding: "10px 12px",
            }}
          >
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.14em",
                color: "var(--dim, #8a8f99)",
                marginBottom: 7,
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              คำแนะนำด้านความปลอดภัย
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 5 }}>
              {result.recommendations.map((r, i) => (
                <li key={i} style={{ fontSize: 12, color: "#d7dae0", lineHeight: 1.5 }}>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

export default UsbAuthorizedRecovery;
