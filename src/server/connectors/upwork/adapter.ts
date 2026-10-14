import type { Connector, ConnectorStatus } from "../types";

/**
 * Upwork official connector status (MCP PoC verified, backend NOT connected).
 *
 * Verified facts (2026-10):
 *  - Upwork's API is GraphQL over OAuth 2.0 (authorization code grant), endpoint
 *    https://api.upwork.com/graphql. Keys are requested per account and scoped.
 *  - The official MCP server is a separate OAuth client connection. Codex's client metadata,
 *    callback and token must never be copied into this application.
 *
 * Until Opportunity Hub has its own OAuth client and the Upwork data-retention terms are
 * confirmed for durable storage, this adapter reports `pending_credentials`. Never scrape
 * authenticated pages or reuse session cookies.
 *
 * Next implementation step: an app-owned OAuth + PKCE flow and a read-only MCP allowlist for
 * `list_accounts` and `find_jobs`. Do not expose proposal/message/Connects tools to the agent.
 */
export const UPWORK_GRAPHQL_ENDPOINT = "https://api.upwork.com/graphql";

export const upworkConnector: Connector = {
  key: "upwork",
  status(): ConnectorStatus {
    const hasKeys = Boolean(process.env.UPWORK_CLIENT_ID && process.env.UPWORK_CLIENT_SECRET);
    if (!hasKeys) {
      return {
        status: "pending_credentials",
        detail: "Faltan UPWORK_CLIENT_ID / UPWORK_CLIENT_SECRET (API key aprobada por Upwork). Usa importación manual.",
      };
    }
    return {
      status: "pending_credentials",
      detail: "Credenciales presentes, pero el flujo OAuth se implementa en M1. Usa importación manual.",
    };
  },
};
