import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authBypassEnabled, createSessionToken, hashPassword, verifyPassword, verifySessionToken } from "@/server/auth/session";
import { isLoginBlocked, registerLoginFailure, resetLoginThrottle } from "@/server/auth/rate-limit";

describe("auth", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", "x".repeat(40));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("creates and verifies session tokens; rejects tampering and expiry", () => {
    const t = createSessionToken();
    expect(verifySessionToken(t)).toBe(true);
    expect(verifySessionToken(t.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBe(false);
    expect(verifySessionToken(t, Date.now() + 8 * 24 * 3600 * 1000)).toBe(false);
    vi.stubEnv("AUTH_SECRET", "y".repeat(40));
    expect(verifySessionToken(t)).toBe(false);
  });

  it("verifies scrypt hashes and plain passwords", () => {
    vi.stubEnv("APP_PASSWORD_HASH", hashPassword("correct horse battery"));
    expect(verifyPassword("correct horse battery")).toBe(true);
    expect(verifyPassword("wrong")).toBe(false);
    vi.stubEnv("APP_PASSWORD_HASH", "");
    vi.stubEnv("APP_PASSWORD", "plain-password-123");
    expect(verifyPassword("plain-password-123")).toBe(true);
    vi.stubEnv("APP_PASSWORD", "short");
    expect(verifyPassword("short")).toBe(false);
  });

  it("never allows the auth bypass in production", () => {
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("NODE_ENV", "production");
    expect(authBypassEnabled()).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(authBypassEnabled()).toBe(true);
  });

  it("throttles repeated failed logins", () => {
    resetLoginThrottle();
    for (let i = 0; i < 5; i++) registerLoginFailure("key");
    expect(isLoginBlocked("key")).toBe(true);
  });
});

describe("password hash format", () => {
  it("uses ':' separators (safe for docker compose env files) and still accepts legacy '$'", () => {
    vi.stubEnv("AUTH_SECRET", "x".repeat(40));
    const h = hashPassword("another long password");
    expect(h.startsWith("scrypt:")).toBe(true);
    expect(h).not.toContain("$");
    vi.stubEnv("APP_PASSWORD_HASH", h.replace(/:/g, "$"));
    expect(verifyPassword("another long password")).toBe(true);
    vi.unstubAllEnvs();
  });
});
