import { engineStatus, startEngine, stopEngine } from "@/lib/engineProcess";

// Route handlers run on the Node runtime by default here (child_process needs
// it). This project's Next config (cacheComponents) rejects an explicit
// `runtime`/`dynamic` segment export, so we rely on the per-response no-store
// header instead.

export async function GET() {
  return Response.json(engineStatus(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  let action: unknown;
  try {
    action = (await req.json())?.action;
  } catch {
    return Response.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  if (action === "start") return Response.json({ ...startEngine(), status: engineStatus() });
  if (action === "stop") return Response.json({ ...stopEngine(), status: engineStatus() });
  return Response.json({ ok: false, message: "action must be 'start' or 'stop'." }, { status: 400 });
}
