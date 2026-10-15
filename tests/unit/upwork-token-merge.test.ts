import { describe, expect, it } from "vitest";
import { getUpworkOAuthConfig } from "@/server/connectors/upwork/config";
import { decryptSecret, encryptSecret } from "@/server/connectors/upwork/secure";
import { buildUpworkTokenWritePlan } from "@/server/connectors/upwork/token-merge";

const config = getUpworkOAuthConfig({
  NODE_ENV: "test",
  UPWORK_MCP_CLIENT_ID: "opportunity-hub-test-client",
  UPWORK_MCP_TOKEN_ENCRYPTION_KEY: "test-token-encryption-key-that-is-long-enough-123",
  UPWORK_MCP_REDIRECT_URI: "http://127.0.0.1:3100/api/connectors/upwork/callback",
} as NodeJS.ProcessEnv);

const existing = {
  refreshTokenCiphertext: encryptSecret("old-refresh", config.tokenEncryptionKey, "opportunity-hub:upwork-refresh-token"),
  refreshTokenExpiresAt: new Date("2030-01-01T00:00:00Z"),
  scope: "jobs:read",
  orgUid: "org-old-account",
  connectedAt: new Date("2026-01-01T00:00:00Z"),
};

const tokenSet = (accessToken: string, refreshToken: string | null) => ({
  accessToken,
  refreshToken,
  accessTokenExpiresAt: new Date("2026-10-15T01:00:00Z"),
  refreshTokenExpiresAt: refreshToken ? new Date("2031-01-01T00:00:00Z") : null,
  scope: null,
});

describe("Upwork credential replacement policy", () => {
  it("fully replaces a reauthorization and cannot inherit another account", () => {
    const plan = buildUpworkTokenWritePlan(tokenSet("new-account-access", null), config, existing, {
      mode: "reauthorize",
      orgUid: null,
      now: new Date("2026-10-14T12:00:00Z"),
    });
    expect(decryptSecret(plan.accessTokenCiphertext, config.tokenEncryptionKey, "opportunity-hub:upwork-access-token")).toBe("new-account-access");
    expect(plan.refreshTokenCiphertext).toBeNull();
    expect(plan.refreshTokenExpiresAt).toBeNull();
    expect(plan.orgUid).toBeNull();
    expect(plan.scope).toBeNull();
    expect(plan.connectedAt).toEqual(new Date("2026-10-14T12:00:00Z"));
  });

  it("refreshes the access token while retaining the old refresh token only when replacement is absent", () => {
    const plan = buildUpworkTokenWritePlan(tokenSet("refreshed-access", null), config, existing, { mode: "refresh" });
    expect(plan.refreshTokenCiphertext).toBe(existing.refreshTokenCiphertext);
    expect(plan.refreshTokenExpiresAt).toEqual(existing.refreshTokenExpiresAt);
    expect(plan.orgUid).toBe("org-old-account");
    expect(plan.scope).toBe("jobs:read");
    expect(decryptSecret(plan.refreshTokenCiphertext!, config.tokenEncryptionKey, "opportunity-hub:upwork-refresh-token")).toBe("old-refresh");
  });

  it("replaces the refresh token during refresh when Upwork sends one", () => {
    const plan = buildUpworkTokenWritePlan(tokenSet("refreshed-access", "replacement-refresh"), config, existing, { mode: "refresh" });
    expect(plan.refreshTokenCiphertext).not.toBe(existing.refreshTokenCiphertext);
    expect(decryptSecret(plan.refreshTokenCiphertext!, config.tokenEncryptionKey, "opportunity-hub:upwork-refresh-token")).toBe("replacement-refresh");
    expect(plan.refreshTokenExpiresAt).toEqual(new Date("2031-01-01T00:00:00Z"));
    expect(plan.orgUid).toBe("org-old-account");
  });
});
