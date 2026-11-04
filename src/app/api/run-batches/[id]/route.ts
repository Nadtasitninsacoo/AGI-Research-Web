import { NextRequest, NextResponse } from "next/server";
import { proxyRunBatches } from "@/lib/server/run-batches-proxy";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid batch ID.",
      },
      { status: 400 },
    );
  }

  return proxyRunBatches(request, {
    segments: ["run-batches", id],
  });
}