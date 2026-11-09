import { NextResponse } from "next/server";
import { darkAgiConfigured, darkAgiFetch, DARK_AGI_NOT_CONFIGURED } from "@/lib/server/darkAgi";

// DARK AGI's own ASCII banner — a locally-handled Terminal meta-command
// ("banner"), never submitted as a job. Public on DARK AGI's side (no auth),
// but still proxied through our own server so the base URL stays server-side.
export async function GET() {
  if (!darkAgiConfigured()) {
    return NextResponse.json({ message: DARK_AGI_NOT_CONFIGURED }, { status: 503 });
  }

  try {
    const res = await darkAgiFetch("/health/banner");
    const data: unknown = await res.json().catch(() => null);
    return NextResponse.json(
      data ?? { message: "DARK AGI ตอบกลับไม่ถูกต้อง" },
      { status: res.status },
    );
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "เรียก DARK AGI ไม่สำเร็จ" },
      { status: 502 },
    );
  }
}
