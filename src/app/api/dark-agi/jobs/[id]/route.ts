import { NextRequest, NextResponse } from "next/server";
import { darkAgiConfigured, darkAgiFetch, DARK_AGI_NOT_CONFIGURED } from "@/lib/server/darkAgi";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  if (!darkAgiConfigured()) {
    return NextResponse.json({ message: DARK_AGI_NOT_CONFIGURED }, { status: 503 });
  }

  const { id } = await context.params;
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) {
    return NextResponse.json({ message: "job id ไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const res = await darkAgiFetch(`/jobs/${encodeURIComponent(id)}`);
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
