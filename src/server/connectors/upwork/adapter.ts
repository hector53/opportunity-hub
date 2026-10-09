import type { Connector, ConnectorStatus } from "../types";

/**
 * Upwork official API adapter (prepared, NOT connected).
 *
 * Verified facts (2026-10):
 *  - Upwork's API is GraphQL over OAuth 2.0 (authorization code grant), endpoint
 *    https://api.upwork.com/graphql. Keys are requested per account and scoped; approval is
 *    manual and can take ~2 weeks. Upwork states the API is not for commercial use.
 *  - Upwork's MCP server is authorized per user/client app. An MCP connection that exists in
 *    another application (e.g. an AI chat client) cannot be reused from this backend.
 *
 * Until credentials are approved and configured, this adapter reports `pending_credentials`
 * and the app relies on manual import + (M1) email notifications. Never scrape authenticated
 * pages or reuse session cookies.
 *
 * M1 plan: implement OAuth callback at /api/connectors/upwork/callback, store refresh token
 * encrypted at rest, and read-only queries for job search and the user's own proposals/rooms.
 * Respect Upwork's data retention/redistribution terms (store minimal fields, keep link to source).
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
