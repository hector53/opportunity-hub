import { describe, expect, it } from "vitest";
import { discoverUpworkOAuthMetadata } from "@/server/connectors/upwork/metadata";

describe("Upwork OAuth metadata", () => {
  it("accepts the provider's public resource and authorization metadata without registering anything", async () => {
    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("oauth-protected-resource")) {
        return new Response(JSON.stringify({ resource: "https://mcp.upwork.com/mcp", authorization_servers: ["https://mcp.upwork.com"] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          issuer: "https://mcp.upwork.com",
          authorization_endpoint: "https://www.upwork.com/ab/account-security/oauth2/authorize",
          token_endpoint: "https://www.upwork.com/api/v3/oauth2/token",
          revocation_endpoint: "https://www.upwork.com/api/v3/oauth2/token/revoke",
          registration_endpoint: "https://www.upwork.com/register",
          code_challenge_methods_supported: ["S256"],
          client_id_metadata_document_supported: true,
        }),
        { status: 200 },
      );
    };
    const metadata = await discoverUpworkOAuthMetadata(fakeFetch);
    expect(metadata.registrationEndpoint).toBe("https://www.upwork.com/register");
    expect(metadata.clientIdMetadataDocumentSupported).toBe(true);
    expect(metadata.codeChallengeMethodsSupported).toContain("S256");
  });

  it("does not accept a provider metadata downgrade", async () => {
    const fakeFetch: typeof fetch = async (input) => {
      if (String(input).includes("oauth-protected-resource")) return new Response(JSON.stringify({ resource: "https://evil.example/mcp", authorization_servers: ["https://mcp.upwork.com"] }), { status: 200 });
      return new Response("{}", { status: 200 });
    };
    await expect(discoverUpworkOAuthMetadata(fakeFetch)).rejects.toThrow(/recurso esperado/);
  });
});
