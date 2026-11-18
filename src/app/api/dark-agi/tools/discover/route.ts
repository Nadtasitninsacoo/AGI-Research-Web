import { NextResponse } from "next/server";
import { darkAgiConfigured, darkAgiFetch, DARK_AGI_NOT_CONFIGURED } from "@/lib/server/darkAgi";

// Ask DARK AGI to re-scan the host for installed tools (PATH). Run after
// installing a program so its operations stop showing "not found".
export async function POST() {
  if (!darkAgiConfigured()) {
    return NextResponse.json({ message: DARK_AGI_NOT_CONFIGURED }, { status: 503 });
  }
  try {
    const res = await darkAgiFetch("/tools/discover", { method: "POST", body: "{}" });
    const data: unknown = await res.json().catch(() => null);
    return NextResponse.json(data ?? { message: "DARK AGI ตอบกลับไม่ถูกต้อง" }, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "เรียก DARK AGI ไม่สำเร็จ" },
      { status: 502 },
    );
  }
}
