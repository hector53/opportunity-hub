import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/server/auth/guard";
import { db, schema } from "@/server/db/client";
import { revalidatePath } from "next/cache";
import { getUpworkOAuthConfig, UPWORK_MCP_OAUTH_COOKIE, UPWORK_MCP_OAUTH_STATE_TTL_SECONDS } from "@/server/connectors/upwork/config";
import { exchangeAuthorizationCode } from "@/server/connectors/upwork/oauth";
import { constantTimeEqual, openOAuthState } from "@/server/connectors/upwork/secure";
import { saveUpworkTokenSet } from "@/server/connectors/upwork/token-store";
import { logActivity } from "@/server/services/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToSources(request: Request, result: string) {
  const url = new URL("/sources", request.url);
  url.searchParams.set("upwork", result);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  if (!(await isAuthenticated())) return Response.json({ error: "No autorizado" }, { status: 401 });
  const url = new URL(request.url);
  const jar = await cookies();
  const sealed = jar.get(UPWORK_MCP_OAUTH_COOKIE)?.value;
  jar.set(UPWORK_MCP_OAUTH_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true" || url.protocol === "https:", path: "/api/connectors/upwork", maxAge: 0 });
  if (!sealed) return redirectToSources(request, "oauth_state_missing");
  if (url.searchParams.get("error")) return redirectToSources(request, "oauth_denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || code.length > 2048 || !state || state.length > 512) return redirectToSources(request, "oauth_invalid");

  try {
    const config = getUpworkOAuthConfig();
    const authSecret = process.env.AUTH_SECRET;
    if (!authSecret || authSecret.length < 32) throw new Error("AUTH_SECRET inválido");
    const transaction = openOAuthState(sealed, authSecret);
    const age = Date.now() - transaction.issuedAt;
    if (age < -30_000 || age > UPWORK_MCP_OAUTH_STATE_TTL_SECONDS * 1000) throw new Error("Estado OAuth expirado");
    if (!constantTimeEqual(transaction.state, state) || transaction.redirectUri !== config.redirectUri) throw new Error("Estado OAuth no coincide");
    const callbackUri = `${url.origin}${url.pathname}`;
    if (callbackUri !== config.redirectUri) throw new Error("Redirect URI no coincide exactamente");
    const tokens = await exchangeAuthorizationCode(config, code, transaction.codeVerifier);
    await saveUpworkTokenSet(tokens, config);
    await db.update(schema.sources).set({ status: "connected", lastError: null }).where(eq(schema.sources.key, "upwork"));
    await logActivity({ entityType: "source", entityId: "upwork", action: "connected", summary: "Upwork MCP conectado para discovery read-only" });
    revalidatePath("/", "layout");
    return redirectToSources(request, "connected");
  } catch {
    return redirectToSources(request, "oauth_failed");
  }
}
