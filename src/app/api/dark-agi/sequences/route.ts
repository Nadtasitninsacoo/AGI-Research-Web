import { NextRequest, NextResponse } from "next/server";
import { darkAgiConfigured, darkAgiFetch, DARK_AGI_NOT_CONFIGURED } from "@/lib/server/darkAgi";

// Queue an ordered list of operations (one step per job, max 20). The backend
// still enforces every target against an enabled, approved scope.
export async function POST(request: NextRequest) {
  if (!darkAgiConfigured()) {
    return NextResponse.json({ message: DARK_AGI_NOT_CONFIGURED }, { status: 503 });
  }

  let body: { name?: unknown; steps?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "ต้องส่งเป็น JSON" }, { status: 400 });
  }

  const rawSteps = Array.isArray(body.steps) ? body.steps : [];
  const steps = rawSteps
    .map((s) => {
      const r = (typeof s === "object" && s !== null ? s : {}) as Record<string, unknown>;
      const toolId = typeof r.toolId === "string" ? r.toolId.trim() : "";
      const operationId = typeof r.operationId === "string" ? r.operationId.trim() : "";
      const input =
        r.input && typeof r.input === "object" && !Array.isArray(r.input) ? r.input : {};
      return { toolId, operationId, input };
    })
    .filter((s) => s.toolId && s.operationId);

  if (steps.length === 0 || steps.length > 20) {
    return NextResponse.json({ message: "ต้องมี 1–20 steps" }, { status: 400 });
  }
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : undefined;

  try {
    const res = await darkAgiFetch("/sequences", {
      method: "POST",
      body: JSON.stringify({ ...(name ? { name } : {}), steps }),
    });
    const data: unknown = await res.json().catch(() => null);
    return NextResponse.json(data ?? { message: "DARK AGI ตอบกลับไม่ถูกต้อง" }, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "เรียก DARK AGI ไม่สำเร็จ" },
      { status: 502 },
    );
  }
}
