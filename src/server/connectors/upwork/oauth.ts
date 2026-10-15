import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  UPWORK_MCP_AUTHORIZATION_URL,
  UPWORK_MCP_REVOCATION_URL,
  UPWORK_MCP_SERVER_URL,
  UPWORK_MCP_TOKEN_URL,
  validateReadOnlyScope,
  type UpworkOAuthConfig,
} from "./config";

export interface UpworkTokenSet {
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scope: string | null;
}

export class UpworkOAuthError extends Error {
  constructor(
    message: string,
    public readonly code = "oauth_error",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "UpworkOAuthError";
  }
}

export function createPkcePair() {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function buildAuthorizationUrl(config: UpworkOAuthConfig, state: string, codeChallenge: string): string {
  const url = new URL(UPWORK_MCP_AUTHORIZATION_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("resource", UPWORK_MCP_SERVER_URL);
  if (config.scope) url.searchParams.set("scope", config.scope);
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).nullable().optional(),
  expires_in: z.coerce.number().int().positive().optional(),
  refresh_token_expires_in: z.coerce.number().int().positive().optional(),
  scope: z.string().nullable().optional(),
});

function tokenEndpointHeaders(config: UpworkOAuthConfig): HeadersInit {
  const headers: HeadersInit = { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" };
  if (config.clientSecret) headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
  return headers;
}

async function tokenRequest(config: UpworkOAuthConfig, body: URLSearchParams, fetchImpl: typeof fetch): Promise<UpworkTokenSet> {
  const response = await fetchImpl(UPWORK_MCP_TOKEN_URL, {
    method: "POST",
    headers: tokenEndpointHeaders(config),
    body,
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new UpworkOAuthError(`Upwork rechazó el intercambio OAuth (HTTP ${response.status})`, "token_exchange_failed", response.status);
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new UpworkOAuthError("Upwork devolvió una respuesta OAuth inválida", "invalid_token_response");
  }
  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) throw new UpworkOAuthError("Upwork no devolvió un access token válido", "invalid_token_response");
  const now = Date.now();
  const scope = validateReadOnlyScope(parsed.data.scope ?? config.scope);
  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token ?? null,
    accessTokenExpiresAt: parsed.data.expires_in ? new Date(now + parsed.data.expires_in * 1000) : null,
    refreshTokenExpiresAt: parsed.data.refresh_token_expires_in ? new Date(now + parsed.data.refresh_token_expires_in * 1000) : null,
    scope,
  };
}

function withClientId(config: UpworkOAuthConfig, body: URLSearchParams) {
  if (!config.clientSecret) body.set("client_id", config.clientId);
  body.set("resource", UPWORK_MCP_SERVER_URL);
  return body;
}

export function exchangeAuthorizationCode(config: UpworkOAuthConfig, code: string, codeVerifier: string, fetchImpl: typeof fetch = fetch) {
  const body = withClientId(config, new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: config.redirectUri, code_verifier: codeVerifier }));
  return tokenRequest(config, body, fetchImpl);
}

export function refreshAccessToken(config: UpworkOAuthConfig, refreshToken: string, fetchImpl: typeof fetch = fetch) {
  const body = withClientId(config, new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
  return tokenRequest(config, body, fetchImpl);
}

export async function revokeUpworkToken(config: UpworkOAuthConfig, token: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const body = withClientId(config, new URLSearchParams({ token, token_type_hint: "refresh_token" }));
  const response = await fetchImpl(UPWORK_MCP_REVOCATION_URL, {
    method: "POST",
    headers: tokenEndpointHeaders(config),
    body,
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  return response.ok || response.status === 404;
}
