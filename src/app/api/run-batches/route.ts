import { NextRequest, NextResponse } from "next/server";
import { proxyRunBatches } from "@/lib/server/run-batches-proxy";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyRunBatches(request, {
    segments: ["run-batches"],
  });
}