import type { Connector, ConnectorStatus } from "../types";

/**
 * Upwork official connector status. Runtime OAuth state is shown by Sources from the database;
 * this synchronous adapter only describes whether the local configuration can start OAuth.
 *
 * Verified facts (2026-10):
 *  - Upwork's API is GraphQL over OAuth 2.0 (authorization code grant), endpoint
 *    https://api.upwork.com/graphql. Keys are requested per account and scoped.
 *  - The official MCP server is a separate OAuth client connection. Codex's client metadata,
 *    callback and token must never be copied into this application.
 *
 * Never scrape authenticated pages or reuse session cookies. MCP results are read-only and have
 * a conservative TTL in the ingestion layer.
 *
 * Runtime implementation: app-owned OAuth + PKCE, encrypted tokens, a read-only MCP allowlist
 * for `list_accounts` and `find_jobs`, and a 23-hour retention window. Do not expose
 * proposal/message/Connects tools to the agent.
 */
export const UPWORK_GRAPHQL_ENDPOINT = "https://api.upwork.com/graphql";

export const upworkConnector: Connector = {
  key: "upwork",
  status(): ConnectorStatus {
    const hasClient = Boolean(process.env.UPWORK_MCP_CLIENT_ID);
    const hasEncryptionKey = (process.env.UPWORK_MCP_TOKEN_ENCRYPTION_KEY?.length ?? 0) >= 32;
    if (!hasClient || !hasEncryptionKey) {
      return {
        status: "pending_credentials",
        detail: "Faltan UPWORK_MCP_CLIENT_ID o UPWORK_MCP_TOKEN_ENCRYPTION_KEY (32+ caracteres). No se usan credenciales de Codex.",
      };
    }
    return {
      status: "pending_credentials",
      detail: "OAuth propio listo para revisión; pulsa Connect Upwork para ver dominio, callback y permisos antes de autorizar.",
    };
  },
};
