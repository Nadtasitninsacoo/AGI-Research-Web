import { NextResponse } from "next/server";
import { darkAgiConfigured, darkAgiFetch, DARK_AGI_NOT_CONFIGURED } from "@/lib/server/darkAgi";

// Read-only list of DARK AGI's Authorized Scopes, always refetched. The
// Terminal's target picker only offers scopes with `active === true`.
export async function GET() {
  if (!darkAgiConfigured()) {
    return NextResponse.json({ message: DARK_AGI_NOT_CONFIGURED }, { status: 503 });
  }
  try {
    const res = await darkAgiFetch("/scopes");
    const data: unknown = await res.json().catch(() => null);
    return NextResponse.json(data ?? { message: "DARK AGI ตอบกลับไม่ถูกต้อง" }, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "เรียก DARK AGI ไม่สำเร็จ" },
      { status: 502 },
    );
  }
}
