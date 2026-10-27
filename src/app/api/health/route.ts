import { NextResponse } from "next/server";

export async function GET() {
  const apiUrl = process.env.AGI_API_URL;

  if (!apiUrl) {
    return NextResponse.json(
      { status: "error", message: "AGI_API_URL is not configured" },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(apiUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    const body = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        {
          status: "error",
          message: `Backend returned HTTP ${response.status}`,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      status: "connected",
      backendStatus: response.status,
      message: body,
    });
  } catch {
    return NextResponse.json(
      {
        status: "disconnected",
        message: "Cannot connect to AGI Research API",
      },
      { status: 503 },
    );
  }
}