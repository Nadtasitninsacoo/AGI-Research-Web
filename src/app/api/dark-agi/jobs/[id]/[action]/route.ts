import { NextRequest, NextResponse } from "next/server";
import { darkAgiConfigured, darkAgiFetch, DARK_AGI_NOT_CONFIGURED } from "@/lib/server/darkAgi";

type RouteContext = { params: Promise<{ id: string; action: string }> };

// Job lifecycle actions. approve/reject are human operator decisions made by
// an explicit click in the console — nothing here ever approves on its own.
// DARK AGI still enforces permission, scope and audit; this only relays.
const ACTIONS = new Set(["approve", "reject", "cancel", "retry"]);

export async function POST(request: NextRequest, context: RouteContext) {
  if (!darkAgiConfigured()) {
    return NextResponse.json({ message: DARK_AGI_NOT_CONFIGURED }, { status: 503 });
  }
  const { id, action } = await context.params;
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id) || !ACTIONS.has(action)) {
    return NextResponse.json({ message: "job id หรือ action ไม่ถูกต้อง" }, { status: 400 });
  }

  let note: string | undefined;
  if (action === "approve" || action === "reject") {
    try {
      const body = (await request.json()) as { note?: unknown };
      if (typeof body.note === "string" && body.note.trim()) note = body.note.trim().slice(0, 500);
    } catch {
      // no body → no note
    }
  }

  try {
    const res = await darkAgiFetch(`/jobs/${encodeURIComponent(id)}/${action}`, {
      method: "POST",
      body: JSON.stringify(note ? { note } : {}),
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
