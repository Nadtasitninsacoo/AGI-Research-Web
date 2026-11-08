// Web login: verify email+password via the backend API, then store the returned
// JWT in an httpOnly cookie. The browser never sees or handles the token — the
// cookie is attached automatically on every request, and middleware gates pages.
import { NextRequest, NextResponse } from "next/server";
import { resolveAgentApiBaseUrl } from "@/lib/agentApi";

export const SESSION_COOKIE = "agi_session";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8h, matches the JWT lifetime

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const email = (body?.email ?? "").trim();
  const password = body?.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ message: "Email and password are required." }, { status: 400 });
  }

  const base = resolveAgentApiBaseUrl(process.env.AGI_API_URL);

  try {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15000),
    });

    const data = (await res.json().catch(() => null)) as
      | { access_token?: string; user?: unknown; message?: string }
      | null;

    if (!res.ok || !data?.access_token) {
      return NextResponse.json(
        { message: data?.message ?? "Invalid email or password." },
        { status: res.status === 200 ? 401 : res.status || 401 },
      );
    }

    const response = NextResponse.json({ ok: true, user: data.user ?? null });
    response.cookies.set(SESSION_COOKIE, data.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    });
    return response;
  } catch {
    return NextResponse.json(
      { message: "Cannot reach the authentication service. Is the API running?" },
      { status: 502 },
    );
  }
}
