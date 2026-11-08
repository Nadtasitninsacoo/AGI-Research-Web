import { NextResponse } from "next/server";
import { radarStatus, startRadar, stopRadar } from "@/lib/threatRadar";

// Control + status for the server-side background Threat-Intel radar.
// GET  → current status (running, sweeps, lastFound, history, ...)
// POST { action: "start", intervalMs?, auto? } | { action: "stop" }

export async function GET() {
  return NextResponse.json(radarStatus());
}

export async function POST(req: Request) {
  let body: { action?: string; intervalMs?: number; auto?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty body → treated as unknown action below */
  }

  if (body.action === "start") {
    return NextResponse.json(startRadar({ intervalMs: body.intervalMs, auto: body.auto }));
  }
  if (body.action === "stop") {
    return NextResponse.json(stopRadar());
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
