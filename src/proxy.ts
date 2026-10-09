import { NextResponse, type NextRequest } from "next/server";
import { authBypassEnabled, SESSION_COOKIE, verifySessionToken } from "@/server/auth/session";

/** Every route requires a valid session except login, health and static assets. */
export function proxy(request: NextRequest) {
  if (authBypassEnabled()) return NextResponse.next();
  const ok = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (request.nextUrl.pathname !== "/") url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Exact exclusions only ("/login", "/api/health" and static assets); "/loginx" etc. stay protected.
  matcher: ["/((?!login(?:/|$)|api/health(?:/|$)|_next/static/|_next/image|favicon\\.ico$|icon\\.svg$).*)"],
};
