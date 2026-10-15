import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { lt } from "drizzle-orm";
import { isAuthenticated } from "@/server/auth/guard";
import { authBypassEnabled, cookieSecure, SESSION_COOKIE, sessionBinding, verifySessionToken } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";
import { getUpworkOAuthConfig, UPWORK_MCP_OAUTH_COOKIE, UPWORK_MCP_OAUTH_STATE_TTL_SECONDS, upworkAuthorizationSummary } from "@/server/connectors/upwork/config";
import { buildAuthorizationUrl, createOAuthState, createPkcePair } from "@/server/connectors/upwork/oauth";
import { encryptSecret, sealOAuthState, UPWORK_OAUTH_CODE_VERIFIER_PURPOSE } from "@/server/connectors/upwork/secure";

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
    const sessionToken = jar.get(SESSION_COOKIE)?.value;
    if (!authBypassEnabled() && !verifySessionToken(sessionToken)) return Response.json({ error: "No autorizado" }, { status: 401 });
    const issuedAt = Date.now();
    const userSubject = "owner";
    const binding = sessionToken && verifySessionToken(sessionToken) ? sessionBinding(sessionToken) : "development-auth-bypass";
    await db.delete(schema.upworkOAuthTransactions).where(lt(schema.upworkOAuthTransactions.expiresAt, new Date(issuedAt)));
    const [transaction] = await db
      .insert(schema.upworkOAuthTransactions)
      .values({
        stateHash: createHash("sha256").update(state, "utf8").digest("base64url"),
        userSubject,
        sessionBinding: binding,
        clientId: config.clientId,
        codeVerifierCiphertext: encryptSecret(codeVerifier, authSecret, UPWORK_OAUTH_CODE_VERIFIER_PURPOSE),
        redirectUri: config.redirectUri,
        expiresAt: new Date(issuedAt + UPWORK_MCP_OAUTH_STATE_TTL_SECONDS * 1000),
      })
      .returning({ id: schema.upworkOAuthTransactions.id });
    if (!transaction) throw new Error("No se pudo crear la transacción OAuth");
    jar.set(UPWORK_MCP_OAUTH_COOKIE, sealOAuthState({ state, transactionId: transaction.id, userSubject, sessionBinding: binding, redirectUri: config.redirectUri, issuedAt }, authSecret), {
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
