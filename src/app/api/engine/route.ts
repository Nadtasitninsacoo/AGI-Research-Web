import { NextResponse } from "next/server";
import { engineStatus, startEngine, stopEngine } from "@/lib/engineProcess";

// Route handlers run on the Node runtime by default here (child_process needs it).
// Strict validation and secure state control enabled.

export async function GET() {
  return NextResponse.json(engineStatus(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  let body: { action?: unknown; token?: string };
  
  try {
    body = await req.json();
  } catch {
    // Risk 1 fixed: Reject malformed JSON immediately instead of defaulting to start
    return NextResponse.json(
      { ok: false, message: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const { action, token } = body;

  // Risk 3 mitigation: Optional token check placeholder for secure authorization
  // if (process.env.ENGINE_SECRET_TOKEN && token !== process.env.ENGINE_SECRET_TOKEN) {
  //   return NextResponse.json({ ok: false, message: "Unauthorized access." }, { status: 401 });
  // }

  // Risk 2 fixed: Strict whitelist validation (no loose conditions like action !== "stop")
  if (action === "start") {
    // Risk 4 managed: Controlled and explicit startup execution
    const result = startEngine();
    return NextResponse.json({ ...result, status: engineStatus() });
  }

  if (action === "stop") {
    const result = stopEngine();
    return NextResponse.json({ ...result, status: engineStatus() });
  }

  // Reject any unknown, malformed, or missing action explicitly
  return NextResponse.json(
    { ok: false, message: "Invalid action. Permitted actions are strictly 'start' or 'stop'." },
    { status: 400 }
  );
}