import { NextRequest, NextResponse } from "next/server";
import { darkAgiConfigured, darkAgiFetch, DARK_AGI_NOT_CONFIGURED } from "@/lib/server/darkAgi";

// Human-operator natural-language command mode — forwards EXACTLY what the
// operator typed to DARK AGI's own AI command interpreter. Never called
// automatically by an agent; only this page's Terminal UI uses it.
export async function POST(request: NextRequest) {
  if (!darkAgiConfigured()) {
    return NextResponse.json({ message: DARK_AGI_NOT_CONFIGURED }, { status: 503 });
  }

  let body: { instruction?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "ต้องส่ง instruction เป็น JSON" }, { status: 400 });
  }

  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) {
    return NextResponse.json({ message: "กรุณาพิมพ์คำสั่ง" }, { status: 400 });
  }

  try {
    const res = await darkAgiFetch("/agents/command", {
      method: "POST",
      body: JSON.stringify({ instruction }),
    });
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
