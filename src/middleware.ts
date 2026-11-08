import { NextRequest, NextResponse } from "next/server";

// Gate the whole app behind login. Anyone without a session cookie is sent to
// /login. The matcher below excludes the login page, the auth API routes, and
// static assets so they stay reachable while logged out.
export function middleware(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get("agi_session")?.value);
  if (hasSession) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Everything except: /login, /api/auth/*, Next internals, and static files.
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|json|woff|woff2|ttf)$).*)",
  ],
};
