import { cookies } from "next/headers";
import { isAuthenticated } from "@/server/auth/guard";
import { cookieSecure } from "@/server/auth/session";
import { getUpworkOAuthConfig, UPWORK_MCP_OAUTH_COOKIE, UPWORK_MCP_OAUTH_STATE_TTL_SECONDS, upworkAuthorizationSummary } from "@/server/connectors/upwork/config";
import { buildAuthorizationUrl, createOAuthState, createPkcePair } from "@/server/connectors/upwork/oauth";
import { sealOAuthState } from "@/server/connectors/upwork/secure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  try {
    const config = getUpworkOAuthConfig();
    const authSecret = process.env.AUTH_SECRET;
    if (!authSecret || authSecret.length < 32) throw new Error("AUTH_SECRET no está configurado correctamente");
    const state = createOAuthState();
    const { codeVerifier, codeChallenge } = createPkcePair();
    const jar = await cookies();
    jar.set(UPWORK_MCP_OAUTH_COOKIE, sealOAuthState({ state, codeVerifier, redirectUri: config.redirectUri, issuedAt: Date.now() }, authSecret), {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure() || config.redirectUri.startsWith("https:"),
      path: "/api/connectors/upwork",
      maxAge: UPWORK_MCP_OAUTH_STATE_TTL_SECONDS,
    });
    return Response.json({ ...upworkAuthorizationSummary(), authorizationUrl: buildAuthorizationUrl(config, state, codeChallenge) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "OAuth de Upwork no está configurado" }, { status: 503 });
  }
}
