/**
 * Minimal allowlist for the first Upwork MCP integration.
 *
 * The official server exposes write-capable tools as well as discovery tools.
 * An Opportunity Hub client must never pass the complete tool registry to an
 * agent: it should expose only account selection and read-only job discovery.
 */
export const UPWORK_MCP_DISCOVERY_TOOLS = ["list_accounts", "find_jobs"] as const;

export type UpworkMcpDiscoveryTool = (typeof UPWORK_MCP_DISCOVERY_TOOLS)[number];

export function isAllowedUpworkMcpDiscoveryTool(name: string): name is UpworkMcpDiscoveryTool {
  return (UPWORK_MCP_DISCOVERY_TOOLS as readonly string[]).includes(name);
}

export function assertAllowedUpworkMcpDiscoveryTool(name: string): asserts name is UpworkMcpDiscoveryTool {
  if (!isAllowedUpworkMcpDiscoveryTool(name)) {
    throw new Error(`Herramienta MCP de Upwork fuera de la allowlist de descubrimiento: ${name}`);
  }
}
