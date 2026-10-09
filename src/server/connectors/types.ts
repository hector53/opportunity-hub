import type { SourceStatus } from "./registry";

export interface ConnectorStatus {
  status: SourceStatus;
  detail: string;
}

/**
 * Contract for automated connectors. Connectors only READ from official, authorized APIs.
 * They never submit proposals, send messages or spend platform credits — those actions are
 * out of scope for connectors and require an explicit user approval flow.
 */
export interface Connector {
  key: string;
  /** Computes runtime status from configuration (credentials present, enabled, ...). */
  status(): ConnectorStatus;
}
