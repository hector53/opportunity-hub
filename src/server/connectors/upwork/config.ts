import { UPWORK_MCP_DISCOVERY_TOOLS } from "./mcp-policy";

const DEFAULT_REDIRECT_PATH = "/api/connectors/upwork/callback";
const DEFAULT_PORT = "3100";

export const UPWORK_MCP_SERVER_URL = "https://mcp.upwork.com/mcp";
export const UPWORK_MCP_AUTHORIZATION_URL = "https://www.upwork.com/ab/account-security/oauth2/authorize";
export const UPWORK_MCP_TOKEN_URL = "https://www.upwork.com/api/v3/oauth2/token";
export const UPWORK_MCP_REVOCATION_URL = "https://www.upwork.com/api/v3/oauth2/token/revoke";
export const UPWORK_MCP_PROTOCOL_VERSION = "2025-06-18";
export const UPWORK_MCP_OAUTH_COOKIE = "oh_upwork_oauth_state";
export const UPWORK_MCP_OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const UPWORK_OAUTH_PROTECTED_RESOURCE_METADATA_URL = "https://mcp.upwork.com/.well-known/oauth-protected-resource/mcp";
export const UPWORK_OAUTH_AUTHORIZATION_SERVER_METADATA_URL = "https://mcp.upwork.com/.well-known/oauth-authorization-server";

export type UpworkClientRegistrationMode = "registered" | "cimd";

export interface UpworkOAuthConfig {
  clientId: string;
  clientSecret: string | null;
  clientRegistrationMode: UpworkClientRegistrationMode;
  redirectUri: string;
  scope: string | null;
  orgUid: string | null;
  tokenEncryptionKey: string;
}

export class UpworkConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpworkConfigError";
  }
}

const WRITE_SCOPE_WORDS = /\b(?:write|manage|send|apply|proposal|message|connects?|profile|contract|financial|upload|save|create|update|delete)\b/i;
const MAX_GRANTED_SCOPE_LENGTH = 2_000;

/** Validates only the scope that Opportunity Hub asks the provider to grant. */
export function validateRequestedScope(scope: string | null): string | null {
  const value = scope?.trim() || null;
  if (value && WRITE_SCOPE_WORDS.test(value)) throw new UpworkConfigError("UPWORK_MCP_SCOPE sólo puede solicitar permisos read-only");
  return value;
}

/**
 * Normalizes the scope returned by Upwork for audit/display. Upwork may return
 * write-capable scopes even when this application requests a narrower scope.
 * This function deliberately does not interpret the provider scope as a
 * capability allowlist; runtime operations are restricted in mcp-policy.ts.
 */
export function normalizeGrantedScope(scope: string | null | undefined): string | null {
  const value = scope?.trim() || null;
  if (value && (value.length > MAX_GRANTED_SCOPE_LENGTH || /[\u0000-\u001f\u007f]/.test(value))) {
    throw new UpworkConfigError("Upwork devolvió un scope OAuth con formato inválido");
  }
  return value;
}

export function requestOrigin(requestUrl: string, headers?: Headers): string {
  try {
    const fallback = new URL(requestUrl);
    const forwardedHost = headers?.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || headers?.get("host")?.trim();
    const forwardedProto = headers?.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (!host) return fallback.origin;
    return new URL(`${forwardedProto || fallback.protocol.replace(":", "")}://${host}`).origin;
  } catch {
    return "null";
  }
}

export function hasMatchingUpworkOAuthOrigin(requestUrl: string, redirectUri: string, headers?: Headers): boolean {
  try {
    return requestOrigin(requestUrl, headers) === new URL(redirectUri).origin;
  } catch {
    return false;
  }
}

/** The browser must start and finish OAuth on the origin registered by the app. */
export function assertUpworkOAuthOrigin(requestUrl: string, redirectUri: string, headers?: Headers): void {
  if (!hasMatchingUpworkOAuthOrigin(requestUrl, redirectUri, headers)) {
    const currentOrigin = (() => {
      try {
        return requestOrigin(requestUrl, headers);
      } catch {
        return "origen inválido";
      }
    })();
    const redirectOrigin = (() => {
      try {
        return new URL(redirectUri).origin;
      } catch {
        return "redirect_uri inválido";
      }
    })();
    throw new UpworkConfigError(`El origen actual (${currentOrigin}) no coincide con el origen configurado para OAuth (${redirectOrigin}). Abre Opportunity Hub con el host exacto del redirect_uri.`);
  }
}

function requiredSecret(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value || value.length < 32) throw new UpworkConfigError(`${key} debe tener al menos 32 caracteres`);
  return value;
}

function exactHttpUrl(value: string, label: string, expectedHost?: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UpworkConfigError(`${label} no es una URL válida`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UpworkConfigError(`${label} debe usar http(s)`);
  if (url.username || url.password || url.hash) throw new UpworkConfigError(`${label} no puede contener credenciales ni fragmento`);
  if (expectedHost && url.hostname.toLowerCase() !== expectedHost) throw new UpworkConfigError(`${label} debe usar ${expectedHost}`);
  return url.toString().replace(/\/$/, "");
}

function redirectUri(env: NodeJS.ProcessEnv): string {
  const port = env.APP_HOST_PORT?.trim() || DEFAULT_PORT;
  const fallback = `http://127.0.0.1:${port}${DEFAULT_REDIRECT_PATH}`;
  const value = exactHttpUrl(env.UPWORK_MCP_REDIRECT_URI?.trim() || fallback, "UPWORK_MCP_REDIRECT_URI");
  const parsed = new URL(value);
  if (parsed.pathname !== DEFAULT_REDIRECT_PATH || parsed.search || parsed.hash) {
    throw new UpworkConfigError(`UPWORK_MCP_REDIRECT_URI debe ser exactamente ${parsed.origin}${DEFAULT_REDIRECT_PATH}`);
  }
  if (parsed.protocol === "http:" && !["127.0.0.1", "localhost"].includes(parsed.hostname.toLowerCase())) {
    throw new UpworkConfigError("El callback http sólo se permite en localhost/127.0.0.1; usa HTTPS fuera de desarrollo");
  }
  return value;
}

/** Server-only configuration. Credentials are never returned to client components. */
export function getUpworkOAuthConfig(env: NodeJS.ProcessEnv = process.env): UpworkOAuthConfig {
  const clientId = env.UPWORK_MCP_CLIENT_ID?.trim();
  if (!clientId) throw new UpworkConfigError("Falta UPWORK_MCP_CLIENT_ID; registra una aplicación propia de Opportunity Hub en Upwork");
  const registrationMode = env.UPWORK_MCP_CLIENT_REGISTRATION_MODE?.trim() || "registered";
  if (registrationMode !== "registered" && registrationMode !== "cimd") {
    throw new UpworkConfigError("UPWORK_MCP_CLIENT_REGISTRATION_MODE sólo admite registered o cimd; DCR no se ejecuta automáticamente");
  }
  if (registrationMode === "cimd") {
    let metadataUrl: URL;
    try {
      metadataUrl = new URL(clientId);
    } catch {
      throw new UpworkConfigError("En modo CIMD, UPWORK_MCP_CLIENT_ID debe ser una URL HTTPS pública de metadata");
    }
    if (metadataUrl.protocol !== "https:" || metadataUrl.username || metadataUrl.password || metadataUrl.hash) {
      throw new UpworkConfigError("En modo CIMD, UPWORK_MCP_CLIENT_ID debe ser una URL HTTPS pública de metadata sin credenciales ni fragmento");
    }
    if (env.UPWORK_MCP_CLIENT_SECRET?.trim()) throw new UpworkConfigError("CIMD usa un cliente público; elimina UPWORK_MCP_CLIENT_SECRET");
  }
  const scope = validateRequestedScope(env.UPWORK_MCP_SCOPE ?? null);
  if (scope && scope.length > 500) throw new UpworkConfigError("UPWORK_MCP_SCOPE es demasiado largo");
  return {
    clientId,
    clientSecret: env.UPWORK_MCP_CLIENT_SECRET?.trim() || null,
    clientRegistrationMode: registrationMode,
    redirectUri: redirectUri(env),
    scope,
    orgUid: env.UPWORK_MCP_ORG_UID?.trim() || null,
    tokenEncryptionKey: requiredSecret(env, "UPWORK_MCP_TOKEN_ENCRYPTION_KEY"),
  };
}

export function upworkAuthorizationSummary(env: NodeJS.ProcessEnv = process.env) {
  const redirect = redirectUri(env);
  const authorizationOrigin = new URL(UPWORK_MCP_AUTHORIZATION_URL).origin;
  return {
    authorizationOrigin,
    authorizationUrl: UPWORK_MCP_AUTHORIZATION_URL,
    redirectUri: redirect,
    registrationMode: env.UPWORK_MCP_CLIENT_REGISTRATION_MODE?.trim() || "registered",
    tools: [...UPWORK_MCP_DISCOVERY_TOOLS],
    scope: env.UPWORK_MCP_SCOPE?.trim() || null,
    oauthPermissionNote: "Upwork controla el scope efectivo y actualmente puede conceder el conjunto completo de permisos al conectar. La allowlist de herramientas es una restricción adicional del código y no convierte por sí sola el token en read-only; el scope devuelto se conserva para auditoría.",
  };
}
