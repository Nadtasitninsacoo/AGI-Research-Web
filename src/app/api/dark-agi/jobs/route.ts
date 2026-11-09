import { NextRequest, NextResponse } from "next/server";
import { darkAgiConfigured, darkAgiFetch, DARK_AGI_NOT_CONFIGURED } from "@/lib/server/darkAgi";

// Direct, deterministic job submission — {toolId, operationId, input} straight
// to DARK AGI's execution engine. Unlike /agents/command this never goes
// through DARK AGI's own AI interpreter, so it works even with no model
// configured in its Model Registry — intended for the Command Reference's
// "RUN DIRECTLY" action, where the operation is already known exactly.
export async function POST(request: NextRequest) {
  if (!darkAgiConfigured()) {
    return NextResponse.json({ message: DARK_AGI_NOT_CONFIGURED }, { status: 503 });
  }

  let body: { toolId?: unknown; operationId?: unknown; input?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "ต้องส่งเป็น JSON" }, { status: 400 });
  }

  const toolId = typeof body.toolId === "string" ? body.toolId.trim() : "";
  const operationId = typeof body.operationId === "string" ? body.operationId.trim() : "";
  if (!toolId || !operationId) {
    return NextResponse.json({ message: "ต้องระบุ toolId และ operationId" }, { status: 400 });
  }
  const input =
    body.input && typeof body.input === "object" && !Array.isArray(body.input) ? body.input : {};

  try {
    const res = await darkAgiFetch("/jobs", {
      method: "POST",
      body: JSON.stringify({ toolId, operationId, input }),
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
