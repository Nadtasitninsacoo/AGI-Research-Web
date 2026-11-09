import { NextResponse } from "next/server";
import { darkAgiConfigured, darkAgiFetch, DARK_AGI_NOT_CONFIGURED } from "@/lib/server/darkAgi";

// Registered Remote Hosts — a SEPARATE authorization from Scope. Scope says
// an address may be touched at all; a Remote Host additionally says this
// platform may execute PowerShell ON that machine, using a credential a human
// explicitly set and approved. Used by the Command Reference to tell whether
// any "*-remote" operation can actually succeed right now.
export async function GET() {
  if (!darkAgiConfigured()) {
    return NextResponse.json({ message: DARK_AGI_NOT_CONFIGURED }, { status: 503 });
  }

  try {
    const res = await darkAgiFetch("/remote-hosts");
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
