/**
 * Minimal allowlist for the first Upwork MCP integration.
 *
 * The official server exposes write-capable tools as well as discovery tools.
 * An Opportunity Hub client must never pass the complete tool registry to an
 * agent: it should expose only account selection and discovery operations. This does not assert
 * that the provider's OAuth token has a read-only scope; Sources shows that permission separately.
 */
export const UPWORK_MCP_DISCOVERY_TOOLS = ["list_accounts", "find_jobs"] as const;

export type UpworkMcpDiscoveryTool = (typeof UPWORK_MCP_DISCOVERY_TOOLS)[number];

/**
 * Opportunity Hub uses stable local aliases while Upwork namespaces the
 * tools exposed by its MCP server. Keep this mapping explicit so that the
 * provider's complete tool registry never becomes our runtime allowlist.
 */
export const UPWORK_MCP_WIRE_TOOLS = {
  list_accounts: "upwork__list_accounts",
  find_jobs: "upwork__find_jobs",
} as const satisfies Record<UpworkMcpDiscoveryTool, string>;

export function isAllowedUpworkMcpDiscoveryTool(name: string): name is UpworkMcpDiscoveryTool {
  return (UPWORK_MCP_DISCOVERY_TOOLS as readonly string[]).includes(name);
}

export function assertAllowedUpworkMcpDiscoveryTool(name: string): asserts name is UpworkMcpDiscoveryTool {
  if (!isAllowedUpworkMcpDiscoveryTool(name)) {
    throw new Error(`Herramienta MCP de Upwork fuera de la allowlist de descubrimiento: ${name}`);
  }
}

export function upworkMcpWireToolName(name: string): string {
  assertAllowedUpworkMcpDiscoveryTool(name);
  return UPWORK_MCP_WIRE_TOOLS[name];
}
