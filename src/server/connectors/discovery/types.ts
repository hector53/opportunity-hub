import type { NormalizedOpportunity } from "@/server/normalization/types";
import type { ConnectorStatus } from "../types";

/**
 * Common contract for opportunity discovery connectors.
 *
 * A connector may use an official API, an official MCP server, or a browser
 * session explicitly allowed by the source. The contract deliberately stops
 * at read-only discovery: applying, messaging, saving jobs, spending credits
 * and other external actions stay outside this boundary.
 */
export type DiscoveryConnectorKind = "official_api" | "mcp" | "browser";

export interface DiscoveryRequest {
  query?: string;
  title?: string;
  mode?: "search" | "smart_search";
  cursor?: string;
  limit?: number;
  filters?: Record<string, boolean | number | string | string[]>;
}

export interface DiscoveryCandidate {
  normalized: NormalizedOpportunity;
  evidence: Record<string, unknown>;
}

export interface DiscoveryPage {
  candidates: DiscoveryCandidate[];
  nextCursor: string | null;
  hasMore: boolean;
  warnings: string[];
}

export interface DiscoveryConnector {
  readonly key: string;
  readonly sourceKey: string;
  readonly kind: DiscoveryConnectorKind;
  /** Read-only tool/action names exposed to this connector. */
  readonly allowedActions: readonly string[];
  status(): ConnectorStatus;
  search(request: DiscoveryRequest): Promise<DiscoveryPage>;
}
