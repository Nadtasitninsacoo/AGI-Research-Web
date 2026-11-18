import { NextRequest, NextResponse } from "next/server";
import { darkAgiConfigured, darkAgiFetch, DARK_AGI_NOT_CONFIGURED } from "@/lib/server/darkAgi";

type RouteContext = { params: Promise<{ action: string }> };

// "emergency-stop": pause the engine, cancel every queued/awaiting job and
// abort every running process. "resume": lift the pause. DARK AGI audits both.
const MAP: Record<string, string> = { stop: "emergency-stop", resume: "resume" };

export async function POST(request: NextRequest, context: RouteContext) {
  if (!darkAgiConfigured()) {
    return NextResponse.json({ message: DARK_AGI_NOT_CONFIGURED }, { status: 503 });
  }
  const { action } = await context.params;
  const target = MAP[action];
  if (!target) return NextResponse.json({ message: "action ไม่ถูกต้อง" }, { status: 400 });

  let body: Record<string, unknown> = {};
  if (action === "stop") {
    let reason = "";
    try {
      const b = (await request.json()) as { reason?: unknown };
      if (typeof b.reason === "string") reason = b.reason.trim();
    } catch {
      // fall through to default
    }
    body = { reason: (reason || "Emergency stop from AGI Research terminal").slice(0, 300) };
  }

  try {
    const res = await darkAgiFetch(`/engine/${target}`, { method: "POST", body: JSON.stringify(body) });
    const data: unknown = await res.json().catch(() => null);
    return NextResponse.json(data ?? { message: "DARK AGI ตอบกลับไม่ถูกต้อง" }, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "เรียก DARK AGI ไม่สำเร็จ" },
      { status: 502 },
    );
  }
}
