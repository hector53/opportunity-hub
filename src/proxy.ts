import { NextResponse, type NextRequest } from "next/server";
import { authBypassEnabled, SESSION_COOKIE, verifySessionToken } from "@/server/auth/session";

const UPWORK_OAUTH_CALLBACK = "/api/connectors/upwork/callback";

/** Every route requires a valid session except login, health, static assets and the guarded OAuth callback. */
export function proxy(request: NextRequest) {
  // The provider's top-level redirect is cross-site, so SameSite=Strict deliberately omits
  // oh_session. The callback authenticates the one-time, encrypted OAuth transaction instead.
  if (request.nextUrl.pathname === UPWORK_OAUTH_CALLBACK) return NextResponse.next();
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
  // Exact matcher exclusions only ("/login", "/api/health", the OAuth callback and static assets);
  // lookalikes such as "/loginx" stay protected.
  matcher: ["/((?!login(?:/|$)|api/health(?:/|$)|_next/static/|_next/image|favicon\\.ico$|icon\\.svg$).*)"],
};
