"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

type Toast = { type: "success" | "error"; text: string };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setToast(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;

      if (!res.ok) {
        setToast({ type: "error", text: data?.message ?? "เข้าสู่ระบบไม่สำเร็จ" });
        return;
      }

      setToast({ type: "success", text: "เข้าสู่ระบบสำเร็จ กำลังเข้าสู่แดชบอร์ด…" });
      const from = new URLSearchParams(window.location.search).get("from");
      const dest = from && from.startsWith("/") && !from.startsWith("/login") ? from : "/";
      setTimeout(() => {
        router.push(dest);
        router.refresh();
      }, 900);
    } catch {
      setToast({ type: "error", text: "เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "var(--bg, #0a0c11)",
      }}
    >
      {/* popup แจ้งผล (สำเร็จ/ไม่สำเร็จ) */}
      {toast && (
        <div
          role={toast.type === "error" ? "alert" : "status"}
          onClick={() => setToast(null)}
          style={{
            position: "fixed",
            top: 22,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 18px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            maxWidth: "90vw",
            color: toast.type === "success" ? "#8ff0bb" : "#ffb4b4",
            background: toast.type === "success" ? "rgba(61,220,132,0.12)" : "rgba(248,30,54,0.12)",
            border: `1px solid ${toast.type === "success" ? "rgba(61,220,132,0.5)" : "rgba(248,30,54,0.5)"}`,
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
            backdropFilter: "blur(6px)",
          }}
        >
          <span style={{ fontSize: 16 }}>{toast.type === "success" ? "✓" : "⚠"}</span>
          {toast.text}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 390,
          padding: "30px 26px",
          border: "1px solid var(--line, rgba(255,255,255,0.1))",
          borderRadius: 14,
          background: "var(--grad-card, linear-gradient(180deg,#1b1f28,#12151b))",
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
        }}
      >
        {/* โลโก้ */}
        <div style={{ display: "grid", placeItems: "center", marginBottom: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/agi-logo.png"
            alt="AGI Research"
            width={150}
            height={128}
            style={{ height: 112, width: "auto", filter: "drop-shadow(0 0 18px rgba(61,220,132,0.25))" }}
          />
        </div>

        <div style={{ marginBottom: 20, textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: "var(--text-strong, #f5f6f9)" }}>
            เข้าสู่ระบบ
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--dim, #9a9ba6)" }}>
            ต้องเข้าสู่ระบบก่อนจึงจะใช้งานแดชบอร์ดได้
          </p>
        </div>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={labelStyle}>EMAIL</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@agi.local"
            style={inputStyle}
          />
        </label>

        <label style={{ display: "block", marginBottom: 18 }}>
          <span style={labelStyle}>PASSWORD</span>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ ...inputStyle, paddingRight: 64 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                height: 28,
                padding: "0 10px",
                border: "1px solid var(--line-strong, rgba(255,255,255,0.16))",
                borderRadius: 6,
                background: "rgba(255,255,255,0.04)",
                color: "var(--dim, #9a9ba6)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                cursor: "pointer",
              }}
            >
              {showPassword ? "ซ่อน" : "ดู"}
            </button>
          </div>
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            height: 42,
            border: "none",
            borderRadius: 9,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.03em",
            cursor: loading ? "not-allowed" : "pointer",
            color: "#fff",
            background: "var(--grad-red, linear-gradient(180deg,#f6243b,#a50f1e))",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </button>
      </form>
    </main>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  letterSpacing: "0.1em",
  color: "var(--dim, #9a9ba6)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid var(--line-strong, rgba(255,255,255,0.16))",
  background: "rgba(8,10,15,0.9)",
  color: "var(--text, #dcdce2)",
  fontSize: 14,
  outline: "none",
};
