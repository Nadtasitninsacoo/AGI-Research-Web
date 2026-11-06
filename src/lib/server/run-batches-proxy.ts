import { NextRequest, NextResponse } from "next/server";

interface ProxyPath {
  segments: string[];
}

export async function proxyRunBatches(
  request: NextRequest,
  path: ProxyPath,
): Promise<NextResponse> {
  const apiUrl = process.env.AGI_API_URL?.trim();
  const apiToken = process.env.AGI_API_TOKEN?.trim();

  if (!apiUrl || !apiToken) {
    console.error(
      "[Run Batches Proxy] AGI_API_URL or AGI_API_TOKEN is missing.",
    );

    return NextResponse.json(
      {
        success: false,
        message: "Backend configuration is missing.",
      },
      { status: 500 },
    );
  }

  try {
    const baseUrl = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
    const backendUrl = new URL(
      `api/${path.segments.map(encodeURIComponent).join("/")}`,
      baseUrl,
    );

    if (!["http:", "https:"].includes(backendUrl.protocol)) {
      return NextResponse.json(
        { success: false, message: "Invalid backend URL." },
        { status: 500 },
      );
    }

    backendUrl.search = request.nextUrl.search;

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      cache: "no-store",
      redirect: "manual",
    });

    const body =
      response.status === 204 ||
      response.status === 205 ||
      response.status === 304
        ? null
        : await response.text();

    const headers = new Headers({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });

    const contentType = response.headers.get("content-type");

    if (contentType) {
      headers.set("Content-Type", contentType);
    }

    return new NextResponse(body, {
      status: response.status,
      headers,
    });
  } catch {
    console.error("[Run Batches Proxy] Backend request failed.");

    return NextResponse.json(
      {
        success: false,
        message: "Backend service is unavailable.",
      },
      { status: 502 },
    );
  }
}