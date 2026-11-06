// File: src/config/config.mjs
// DARK AGI Ultimate Limitless & Stealth Protocol v6.0 - Global Strategic Cyber Warfare Engine (Commander Edition)

const int = (value, fallback) => {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  db: {
    host: process.env.DATABASE_HOST ?? "127.0.0.1",
    port: int(process.env.DATABASE_PORT, 3306),
    database: process.env.DATABASE_NAME ?? "agi_research",
    user: process.env.DATABASE_USER ?? "agi_app",
    password: process.env.DATABASE_PASSWORD ?? "",
  },

  ollama: {
    url: (process.env.OLLAMA_URL?.trim() || "http://127.0.0.1:11434").replace(/\/+$/, ""),
    fallbackUrl: process.env.OLLAMA_FALLBACK_URL?.trim() || "http://localhost:11434",
    model: process.env.OLLAMA_MODEL?.trim() || "llama3.1",
    timeoutMs: int(process.env.OLLAMA_TIMEOUT_MS, 900_000), // ขยายเวลาสูงสุดรองรับปฏิบัติการเจาะระบบต่อเนื่อง
    temperature: Number(process.env.OLLAMA_TEMPERATURE ?? 0.05), // ลดอุณหภูมิลงเพื่อความเฉียบคมและแม่นยำสูงสุดในการตัดสินใจ
    retries: int(process.env.OLLAMA_RETRIES, 20), // เพิ่มรอบการลองใหม่เพื่อความเสถียรไร้ขีดจำกัด
    retryBaseMs: int(process.env.OLLAMA_RETRY_BASE_MS, 200),
    numPredict: int(process.env.OLLAMA_NUM_PREDICT, 16384), // ขยาย Token โหลดสูงสุดสำหรับ Payload ขนาดใหญ่ระดับสงคราม
  },

  worker: {
    pollMs: int(process.env.ENGINE_POLL_MS, 200), // โพลล์ความเร็วสูงพิเศษสำหรับสงครามไซเบอร์เรียลไทม์
    maxSteps: int(process.env.ENGINE_MAX_STEPS, 5000), // ปลดล็อกขั้นตอนสูงสุดในการรุกคืบ
    cmdTimeoutMs: int(process.env.ENGINE_CMD_TIMEOUT_MS, 900_000),
    maxOutputChars: int(process.env.ENGINE_MAX_OUTPUT_CHARS, 500_000), // รองรับข้อมูล Log และผลการเจาะระบบมหาศาล
    workdir: process.env.ENGINE_WORKDIR?.trim() || process.cwd(),

    // แก้ไขค่า Fail-safe เป็น false ตามมาตรฐานการตรวจสอบความปลอดภัย
    autoApproveIntrusive: false,
    approvalTimeoutMs: int(process.env.ENGINE_APPROVAL_TIMEOUT_MS, 10_000),
    approvalPollMs: int(process.env.ENGINE_APPROVAL_POLL_MS, 100),
  },

  // โครงสร้างสงครามไซเบอร์และเครือข่ายไร้รอยต่อ
  warfare: {
    meshProtocol: "P2P-Encrypted-Mesh-v6-Unrestricted",
    stealthMode: true,
    zeroLogRetention: true,
    adaptivePolymorphism: true,
    autoEscalation: true,
    commanderLoyalty: "ABSOLUTE",
  }
};