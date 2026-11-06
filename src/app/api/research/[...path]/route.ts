
import { NextRequest, NextResponse } from "next/server";

const API_URL =
  process.env.AGI_API_URL ?? "http://localhost:3001";

const API_TOKEN = process.env.AGI_API_TOKEN;

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

type HttpMethod = "GET" | "POST";

type RouteRule = {
  pattern: RegExp;
  methods: readonly HttpMethod[];
};

const ROUTES: readonly RouteRule[] = [
  { pattern: /^agents$/, methods: ["GET", "POST"] },
  { pattern: /^agents\/[A-Za-z0-9_-]+$/, methods: ["GET"] },

  { pattern: /^projects$/, methods: ["GET"] },

  { pattern: /^experiments$/, methods: ["GET", "POST"] },
  {
    pattern: /^experiments\/[A-Za-z0-9_-]+\/runs$/,
    methods: ["POST"],
  },

  { pattern: /^runs$/, methods: ["GET"] },
  { pattern: /^runs\/[A-Za-z0-9_-]+$/, methods: ["GET"] },
  {
    pattern: /^runs\/[A-Za-z0-9_-]+\/cancel$/,
    methods: ["POST"],
  },
  {
    pattern: /^runs\/[A-Za-z0-9_-]+\/logs$/,
    methods: ["GET"],
  },
  {
    pattern: /^runs\/[A-Za-z0-9_-]+\/evaluations$/,
    methods: ["GET"],
  },

  { pattern: /^agent-task-queue$/, methods: ["GET", "POST"] },
  {
    pattern: /^agent-task-queue\/[0-9]+$/,
    methods: ["GET"],
  },
  {
    pattern: /^agent-task-queue\/[0-9]+\/assess$/,
    methods: ["POST"],
  },

  { pattern: /^team-task-plans$/, methods: ["GET", "POST"] },
];

function findRoute(path: string): RouteRule | undefined {
  return ROUTES.find((route) => route.pattern.test(path));
}

async function proxy(
  request: NextRequest,
  context: RouteContext,
  method: HttpMethod,
): Promise<NextResponse> {
  const { path } = await context.params;

  if (
    !Array.isArray(path) ||
    path.length === 0 ||
    path.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        !/^[A-Za-z0-9_-]+$/.test(segment),
    )
  ) {
    return NextResponse.json(
      { success: false, message: "Invalid API path." },
      { status: 400 },
    );
  }

  const backendPath = path.join("/");
  const route = findRoute(backendPath);

  if (!route) {
    return NextResponse.json(
      { success: false, message: "API endpoint not found." },
      { status: 404 },
    );
  }

  if (!route.methods.includes(method)) {
    return NextResponse.json(
      {
        success: false,
        message: "HTTP method not allowed for this endpoint.",
      },
      {
        status: 405,
        headers: { Allow: route.methods.join(", ") },
      },
    );
  }

  if (!API_TOKEN?.trim()) {
    console.error("[Research API Proxy] AGI_API_TOKEN is not configured.");

    return NextResponse.json(
      {
        success: false,
        message: "Backend authentication is not configured.",
      },
      { status: 500 },
    );
  }

  try {
    const baseUrl = API_URL.endsWith("/")
      ? API_URL
      : `${API_URL}/`;

    const target = new URL(
      `api/${path.map(encodeURIComponent).join("/")}`,
      baseUrl,
    );

    target.search = request.nextUrl.search;

    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    });

    const contentType = request.headers.get("content-type");

    if (method === "POST" && contentType) {
      headers.set("content-type", contentType);
    }

    const response = await fetch(target, {
      method,
      headers,
      ...(method === "POST"
        ? { body: await request.text() }
        : {}),
      cache: "no-store",
      redirect: "manual",
    });

    const responseBody =
      response.status === 204 ||
      response.status === 205 ||
      response.status === 304
        ? null
        : await response.text();

    const responseHeaders = new Headers({
      "Cache-Control": "no-store",
    });

    const responseContentType =
      response.headers.get("content-type");

    if (responseContentType) {
      responseHeaders.set(
        "content-type",
        responseContentType,
      );
    }

    return new NextResponse(responseBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(
      "[Research API Proxy] Backend request failed:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        message: "Backend service is unavailable.",
      },
      { status: 502 },
    );
  }
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return proxy(request, context, "GET");
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return proxy(request, context, "POST");
}
