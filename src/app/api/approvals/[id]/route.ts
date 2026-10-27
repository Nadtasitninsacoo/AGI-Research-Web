import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
import { db } from "@/lib/db";

// Resolve one pending approval: approve or deny. Only a still-pending row is
// changed, so a late click cannot override a decision the engine already acted on.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const approvalId = Number(id);
  if (!Number.isSafeInteger(approvalId) || approvalId < 1) {
    return NextResponse.json({ error: "invalid approval id" }, { status: 400 });
  }

  let decision: unknown;
  try {
    ({ decision } = (await request.json()) as { decision?: unknown });
  } catch {
    return NextResponse.json({ error: "expected JSON { decision }" }, { status: 400 });
  }
  if (decision !== "approve" && decision !== "deny") {
    return NextResponse.json({ error: "`decision` must be \"approve\" or \"deny\"" }, { status: 400 });
  }
  const status = decision === "approve" ? "approved" : "denied";

  try {
    const [res] = await db.query<ResultSetHeader>(
      `UPDATE command_approvals SET status = ?, resolved_at = NOW() WHERE id = ? AND status = 'pending'`,
      [status, approvalId],
    );
    if (res.affectedRows === 0) {
      return NextResponse.json({ error: "already resolved or not found" }, { status: 409 });
    }
    return NextResponse.json({ id: approvalId, status });
  } catch {
    return NextResponse.json({ error: "approvals table unavailable; run `npm run db:setup`" }, { status: 503 });
  }
}
