import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { authBypassEnabled, SESSION_COOKIE, sessionBinding, verifySessionToken } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";
import { revalidatePath } from "next/cache";
import { getUpworkOAuthConfig, hasMatchingUpworkOAuthOrigin, requestOrigin, UPWORK_MCP_OAUTH_COOKIE, UPWORK_MCP_OAUTH_STATE_TTL_SECONDS } from "@/server/connectors/upwork/config";
import { exchangeAuthorizationCode } from "@/server/connectors/upwork/oauth";
import { constantTimeEqual, decryptSecret, openOAuthState, UPWORK_OAUTH_CODE_VERIFIER_PURPOSE } from "@/server/connectors/upwork/secure";
import { saveUpworkTokenSet } from "@/server/connectors/upwork/token-store";
import { logActivity } from "@/server/services/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToSources(request: Request, result: string, redirectUri?: string) {
  const origin = redirectUri ? new URL(redirectUri).origin : requestOrigin(request.url, request.headers);
  const url = new URL("/sources", origin === "null" ? request.url : `${origin}/`);
  url.searchParams.set("upwork", result);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  let config: ReturnType<typeof getUpworkOAuthConfig>;
  try {
    config = getUpworkOAuthConfig();
  } catch {
    // Keep a provider denial user-friendly even if local OAuth configuration
    // was removed after the authorization page was opened.
    return redirectToSources(request, url.searchParams.get("error") ? "oauth_denied" : "oauth_failed");
  }
  if (!hasMatchingUpworkOAuthOrigin(request.url, config.redirectUri, request.headers)) return redirectToSources(request, "oauth_origin_mismatch", config.redirectUri);
  const jar = await cookies();
  const sealed = jar.get(UPWORK_MCP_OAUTH_COOKIE)?.value;
  jar.set(UPWORK_MCP_OAUTH_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true" || config.redirectUri.startsWith("https:"), path: "/api/connectors/upwork", maxAge: 0 });
  if (!sealed) return redirectToSources(request, "oauth_state_missing", config.redirectUri);
  if (url.searchParams.get("error")) return redirectToSources(request, "oauth_denied", config.redirectUri);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || code.length > 2048 || !state || state.length > 512) return redirectToSources(request, "oauth_invalid", config.redirectUri);

  try {
    const authSecret = process.env.AUTH_SECRET;
    if (!authSecret || authSecret.length < 32) throw new Error("AUTH_SECRET inválido");
    const transaction = openOAuthState(sealed, authSecret);
    const age = Date.now() - transaction.issuedAt;
    if (age < -30_000 || age > UPWORK_MCP_OAUTH_STATE_TTL_SECONDS * 1000) throw new Error("Estado OAuth expirado");
    if (!constantTimeEqual(transaction.state, state) || transaction.redirectUri !== config.redirectUri) throw new Error("Estado OAuth no coincide");
    const callbackUri = `${requestOrigin(request.url, request.headers)}${url.pathname}`;
    if (callbackUri !== config.redirectUri) throw new Error("Redirect URI no coincide exactamente");
    if (transaction.userSubject !== "owner") throw new Error("Usuario OAuth no válido");
    const sessionToken = jar.get(SESSION_COOKIE)?.value;
    if (sessionToken && !authBypassEnabled() && (!verifySessionToken(sessionToken) || !constantTimeEqual(sessionBinding(sessionToken), transaction.sessionBinding))) {
      throw new Error("La transacción OAuth no pertenece a la sesión actual");
    }
    const stateHash = createHash("sha256").update(transaction.state, "utf8").digest("base64url");
    const [stored] = await db
      .select()
      .from(schema.upworkOAuthTransactions)
      .where(and(eq(schema.upworkOAuthTransactions.id, transaction.transactionId), eq(schema.upworkOAuthTransactions.stateHash, stateHash), eq(schema.upworkOAuthTransactions.clientId, config.clientId)))
      .limit(1);
    if (!stored || stored.consumedAt || stored.expiresAt.getTime() <= Date.now() || stored.redirectUri !== config.redirectUri) throw new Error("Transacción OAuth inválida o expirada");
    const [claimed] = await db
      .update(schema.upworkOAuthTransactions)
      .set({ consumedAt: new Date() })
      .where(and(eq(schema.upworkOAuthTransactions.id, stored.id), isNull(schema.upworkOAuthTransactions.consumedAt), gt(schema.upworkOAuthTransactions.expiresAt, new Date())))
      .returning({ id: schema.upworkOAuthTransactions.id });
    if (!claimed) throw new Error("La transacción OAuth ya fue utilizada");
    const codeVerifier = decryptSecret(stored.codeVerifierCiphertext, authSecret, UPWORK_OAUTH_CODE_VERIFIER_PURPOSE);
    await db.delete(schema.upworkOAuthTransactions).where(eq(schema.upworkOAuthTransactions.id, stored.id));
    const tokens = await exchangeAuthorizationCode(config, code, codeVerifier);
    // Full reauthorization never inherits the previous account/org or refresh token.
    await saveUpworkTokenSet(tokens, config, { mode: "reauthorize", orgUid: null });
    await db.update(schema.sources).set({ status: "connected", lastError: null }).where(eq(schema.sources.key, "upwork"));
    await logActivity({ entityType: "source", entityId: "upwork", action: "connected", summary: "Upwork MCP conectado para discovery read-only" });
    revalidatePath("/", "layout");
    return redirectToSources(request, "connected", config.redirectUri);
  } catch {
    return redirectToSources(request, "oauth_failed", config.redirectUri);
  }
}
