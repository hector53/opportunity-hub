import {
  UPWORK_MCP_AUTHORIZATION_URL,
  UPWORK_MCP_REVOCATION_URL,
  UPWORK_MCP_SERVER_URL,
  UPWORK_MCP_TOKEN_URL,
  UPWORK_OAUTH_AUTHORIZATION_SERVER_METADATA_URL,
  UPWORK_OAUTH_PROTECTED_RESOURCE_METADATA_URL,
} from "./config";

export interface UpworkOAuthMetadata {
  resource: string;
  authorizationServers: string[];
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint: string | null;
  registrationEndpoint: string | null;
  clientIdMetadataDocumentSupported: boolean;
  codeChallengeMethodsSupported: string[];
}

/** Read-only discovery used for audits/fixtures; it never registers a client or starts OAuth. */
export async function discoverUpworkOAuthMetadata(fetchImpl: typeof fetch = fetch): Promise<UpworkOAuthMetadata> {
  const resourceResponse = await fetchImpl(UPWORK_OAUTH_PROTECTED_RESOURCE_METADATA_URL, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!resourceResponse.ok) throw new Error(`Upwork resource metadata HTTP ${resourceResponse.status}`);
  const resource = (await resourceResponse.json()) as { resource?: unknown; authorization_servers?: unknown };
  const authorizationServers = Array.isArray(resource.authorization_servers) ? resource.authorization_servers.filter((v): v is string => typeof v === "string") : [];
  if (resource.resource !== UPWORK_MCP_SERVER_URL || !authorizationServers.includes("https://mcp.upwork.com")) throw new Error("Metadata del recurso MCP de Upwork no coincide con el recurso esperado");

  const authResponse = await fetchImpl(UPWORK_OAUTH_AUTHORIZATION_SERVER_METADATA_URL, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!authResponse.ok) throw new Error(`Upwork authorization metadata HTTP ${authResponse.status}`);
  const metadata = (await authResponse.json()) as Record<string, unknown>;
  const codeChallengeMethods = Array.isArray(metadata.code_challenge_methods_supported) ? metadata.code_challenge_methods_supported.filter((v): v is string => typeof v === "string") : [];
  if (metadata.issuer !== "https://mcp.upwork.com" || metadata.authorization_endpoint !== UPWORK_MCP_AUTHORIZATION_URL || metadata.token_endpoint !== UPWORK_MCP_TOKEN_URL || !codeChallengeMethods.includes("S256")) {
    throw new Error("Metadata OAuth de Upwork no coincide con PKCE/endpoints esperados");
  }
  const revocationEndpoint = typeof metadata.revocation_endpoint === "string" ? metadata.revocation_endpoint : null;
  if (revocationEndpoint && revocationEndpoint !== UPWORK_MCP_REVOCATION_URL && revocationEndpoint !== "https://www.upwork.com/api/v3/oauth2/token/revoke") {
    throw new Error("Endpoint de revocación OAuth de Upwork no reconocido");
  }
  return {
    resource: resource.resource,
    authorizationServers,
    issuer: metadata.issuer,
    authorizationEndpoint: metadata.authorization_endpoint,
    tokenEndpoint: metadata.token_endpoint,
    revocationEndpoint,
    registrationEndpoint: typeof metadata.registration_endpoint === "string" ? metadata.registration_endpoint : null,
    clientIdMetadataDocumentSupported: metadata.client_id_metadata_document_supported === true,
    codeChallengeMethodsSupported: codeChallengeMethods,
  };
}
