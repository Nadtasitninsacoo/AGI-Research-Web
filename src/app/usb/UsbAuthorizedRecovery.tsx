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

/** Classify a password-storage scheme from its encoded form — no recovery. */
function assess(raw: string): Assessment | null {
  const s = raw.trim();
  if (!s) return null;

  // Modern, salted, adaptive KDFs ----------------------------------------
  const bcrypt = /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/.exec(s);
  if (bcrypt) {
    const cost = Number(bcrypt[1]);
    const strong = cost >= 12;
    return {
      scheme: `bcrypt (cost ${cost})`,
      grade: strong ? "strong" : "acceptable",
      detail: strong
        ? "ใช้ salt และปรับความช้าได้ (adaptive) — เหมาะสำหรับเก็บรหัสผ่าน"
        : `cost ${cost} ต่ำไปสำหรับฮาร์ดแวร์ปัจจุบัน ควรเพิ่ม work factor`,
      recommendations: strong
        ? [MFA, ROTATE]
        : ["เพิ่ม bcrypt cost เป็น ≥ 12", MFA, ROTATE],
    };
  }
  if (/^\$argon2(id|i|d)\$/.test(s)) {
    return {
      scheme: "Argon2",
      grade: "strong",
      detail: "memory-hard KDF ที่แนะนำปัจจุบัน — ทนต่อการเร่งด้วย GPU/ASIC",
      recommendations: ["ตรวจว่าใช้ Argon2id และพารามิเตอร์หน่วยความจำเพียงพอ", MFA],
    };
  }
  if (/^\$(scrypt|7)\$/.test(s)) {
    return {
      scheme: "scrypt",
      grade: "strong",
      detail: "memory-hard KDF — เหมาะสำหรับเก็บรหัสผ่าน",
      recommendations: [MFA, ROTATE],
    };
  }
  if (/^\$6\$/.test(s)) {
    return {
      scheme: "sha512crypt ($6$)",
      grade: "acceptable",
      detail: "มี salt และหลายรอบ แต่ไม่ memory-hard",
      recommendations: [MIGRATE, MFA],
    };
  }
  if (/^\$5\$/.test(s)) {
    return {
      scheme: "sha256crypt ($5$)",
      grade: "acceptable",
      detail: "มี salt แต่ยังเร่งได้เร็วกว่า KDF สมัยใหม่",
      recommendations: [MIGRATE, MFA],
    };
  }
  if (/^\$1\$/.test(s)) {
    return {
      scheme: "md5crypt ($1$)",
      grade: "weak",
      detail: "อ่อนแอและล้าสมัย — ไม่ควรใช้เก็บรหัสผ่านอีกต่อไป",
      recommendations: [MIGRATE, MFA, ROTATE],
    };
  }
  if (/pbkdf2/i.test(s)) {
    return {
      scheme: "PBKDF2",
      grade: "acceptable",
      detail: "มี salt และหลายรอบ แต่ไม่ memory-hard — ต้องตั้ง iteration ให้สูง",
      recommendations: ["ใช้ iteration สูง (เช่น ≥ 600k สำหรับ SHA-256) หรือย้ายไป Argon2id", MFA],
    };
  }

  // Unsalted / fast raw hashes — weak for password storage -----------------
  if (/^\*[0-9A-F]{40}$/i.test(s)) {
    return {
      scheme: "MySQL 4.1+ (SHA-1 ซ้อน)",
      grade: "weak",
      detail: "แฮชเร็วและไม่มี salt ต่อผู้ใช้ — เสี่ยงต่อ dictionary/rainbow",
      recommendations: [MIGRATE, MFA, ROTATE],
    };
  }
  if (/^[0-9a-f]{32}$/i.test(s)) {
    return {
      scheme: "MD5 / NTLM (32 hex)",
      grade: "weak",
      detail: "แฮชเร็ว ไม่มี salt — ไม่เหมาะกับการเก็บรหัสผ่านโดยสิ้นเชิง",
      recommendations: [MIGRATE, MFA, ROTATE],
    };
  }
  if (/^[0-9a-f]{40}$/i.test(s)) {
    return {
      scheme: "SHA-1 (40 hex)",
      grade: "weak",
      detail: "ล้าสมัยและเร็วเกินไป — เลิกใช้สำหรับรหัสผ่าน",
      recommendations: [MIGRATE, MFA, ROTATE],
    };
  }
  if (/^[0-9a-f]{64}$/i.test(s)) {
    return {
      scheme: "SHA-256 ดิบ (64 hex)",
      grade: "weak",
      detail: "เร็วและมักไม่มี salt — ไม่ใช่ KDF สำหรับรหัสผ่าน",
      recommendations: [MIGRATE, MFA],
    };
  }
  if (/^[0-9a-f]{128}$/i.test(s)) {
    return {
      scheme: "SHA-512 ดิบ (128 hex)",
      grade: "weak",
      detail: "เร็วและมักไม่มี salt — ควรใช้ KDF เฉพาะทางแทน",
      recommendations: [MIGRATE, MFA],
    };
  }

  return {
    scheme: "ไม่รู้จักรูปแบบ",
    grade: "unknown",
    detail: "ระบุอัลกอริทึมจากรูปแบบที่วางมาไม่ได้",
    recommendations: [
      "ตรวจสอบว่าจัดเก็บด้วย Argon2id / bcrypt / scrypt",
      MFA,
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
