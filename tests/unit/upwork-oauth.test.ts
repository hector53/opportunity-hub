import { describe, expect, it } from "vitest";
import { getUpworkOAuthConfig, validateReadOnlyScope } from "@/server/connectors/upwork/config";
import { buildAuthorizationUrl, createPkcePair, exchangeAuthorizationCode, revokeUpworkToken } from "@/server/connectors/upwork/oauth";
import { UPWORK_MCP_REVOCATION_URL } from "@/server/connectors/upwork/config";
import { constantTimeEqual, decryptSecret, encryptSecret, openOAuthState, sealOAuthState } from "@/server/connectors/upwork/secure";

const env = {
  NODE_ENV: "test",
  UPWORK_MCP_CLIENT_ID: "opportunity-hub-test-client",
  UPWORK_MCP_CLIENT_SECRET: "test-client-secret",
  UPWORK_MCP_TOKEN_ENCRYPTION_KEY: "test-token-encryption-key-that-is-long-enough-123",
  UPWORK_MCP_REDIRECT_URI: "http://127.0.0.1:3100/api/connectors/upwork/callback",
  UPWORK_MCP_SCOPE: "jobs:read",
} as NodeJS.ProcessEnv;

describe("Upwork OAuth security", () => {
  it("builds an exact redirect URI and PKCE authorization request", () => {
    const config = getUpworkOAuthConfig(env);
    const { codeChallenge } = createPkcePair();
    const url = new URL(buildAuthorizationUrl(config, "state-test", codeChallenge));
    expect(url.origin).toBe("https://www.upwork.com");
    expect(url.pathname).toBe("/ab/account-security/oauth2/authorize");
    expect(url.searchParams.get("redirect_uri")).toBe(env.UPWORK_MCP_REDIRECT_URI);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("resource")).toBe("https://mcp.upwork.com/mcp");
    expect(url.searchParams.get("scope")).toBe("jobs:read");
  });

  it("rejects a write-capable OAuth scope", () => {
    expect(() => validateReadOnlyScope("jobs:read proposals:write")).toThrow(/read-only/i);
  });

  it("requires a legitimate registered client or an explicit CIMD URL", () => {
    expect(getUpworkOAuthConfig({ ...env, UPWORK_MCP_CLIENT_REGISTRATION_MODE: "registered" }).clientRegistrationMode).toBe("registered");
    expect(
      getUpworkOAuthConfig({
        ...env,
        UPWORK_MCP_CLIENT_REGISTRATION_MODE: "cimd",
        UPWORK_MCP_CLIENT_ID: "https://opportunity.example.test/.well-known/oauth-client-metadata.json",
        UPWORK_MCP_CLIENT_SECRET: "",
      }).clientRegistrationMode,
    ).toBe("cimd");
    expect(() => getUpworkOAuthConfig({ ...env, UPWORK_MCP_CLIENT_REGISTRATION_MODE: "dcr" })).toThrow(/DCR/);
    expect(() => getUpworkOAuthConfig({ ...env, UPWORK_MCP_CLIENT_REGISTRATION_MODE: "cimd", UPWORK_MCP_CLIENT_ID: "not-a-url", UPWORK_MCP_CLIENT_SECRET: "" })).toThrow(/CIMD/);
  });

  it("seals OAuth state and rejects tampering", () => {
    const payload = { state: "state", transactionId: "tx-test", userSubject: "owner", sessionBinding: "binding-test", redirectUri: env.UPWORK_MCP_REDIRECT_URI!, issuedAt: Date.now() };
    const sealed = sealOAuthState(payload, "auth-secret-that-is-long-enough-for-tests-123");
    expect(openOAuthState(sealed, "auth-secret-that-is-long-enough-for-tests-123")).toEqual(payload);
    expect(() => openOAuthState(`${sealed}x`, "auth-secret-that-is-long-enough-for-tests-123")).toThrow();
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("same", "other")).toBe(false);
  });

  it("encrypts tokens with authenticated encryption", () => {
    const material = env.UPWORK_MCP_TOKEN_ENCRYPTION_KEY!;
    const envelope = encryptSecret("synthetic-access-token", material, "test-purpose");
    expect(envelope).not.toContain("synthetic-access-token");
    expect(decryptSecret(envelope, material, "test-purpose")).toBe("synthetic-access-token");
    expect(() => decryptSecret(envelope, material, "other-purpose")).toThrow();
  });

  it("uses client authentication without exposing the secret in the URL", async () => {
    const config = getUpworkOAuthConfig(env);
    let seenRequest: RequestInit | undefined;
    const fakeFetch: typeof fetch = async (_input, init) => {
      seenRequest = init;
      return new Response(JSON.stringify({ access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_in: 3600, scope: "jobs:read" }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const tokens = await exchangeAuthorizationCode(config, "synthetic-code", "synthetic-verifier", fakeFetch);
    expect(tokens.accessToken).toBe("synthetic-access");
    expect(String(seenRequest?.body)).toContain("grant_type=authorization_code");
    expect(String(seenRequest?.body)).not.toContain("synthetic-client-secret");
    expect(JSON.stringify(seenRequest?.headers)).toContain("Authorization");
  });

  it("uses the provider's revocation endpoint without exposing the token in the URL", async () => {
    const config = getUpworkOAuthConfig(env);
    let seenUrl = "";
    let seenBody = "";
    const fakeFetch: typeof fetch = async (input, init) => {
      seenUrl = String(input);
      seenBody = String(init?.body);
      return new Response(null, { status: 200 });
    };
    await expect(revokeUpworkToken(config, "synthetic-refresh-token", fakeFetch)).resolves.toBe(true);
    expect(seenUrl).toBe(UPWORK_MCP_REVOCATION_URL);
    expect(seenBody).toContain("token=synthetic-refresh-token");
    expect(seenUrl).not.toContain("synthetic-refresh-token");
  });
});
