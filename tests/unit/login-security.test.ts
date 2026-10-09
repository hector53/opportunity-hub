import { beforeEach, describe, expect, it } from "vitest";
import { loginClientKey, safeRedirectPath } from "@/server/auth/client-key";
import { clearLoginFailures, isLoginBlocked, MAX_FAILURES_GLOBAL, MAX_FAILURES_PER_KEY, registerLoginFailure, resetLoginThrottle } from "@/server/auth/rate-limit";

const h = (m: Record<string, string>) => ({ get: (k: string) => m[k.toLowerCase()] ?? null });

describe("proxy header trust", () => {
  it("ignores forwarding headers unless TRUST_PROXY=true", () => {
    expect(loginClientKey(h({ "x-forwarded-for": "1.2.3.4" }), {})).toBe("direct");
    expect(loginClientKey(h({ "x-real-ip": "1.2.3.4" }), { TRUST_PROXY: "false" })).toBe("direct");
  });
  it("with TRUST_PROXY uses X-Real-IP or the LAST X-Forwarded-For hop (not the spoofable first one)", () => {
    expect(loginClientKey(h({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }), { TRUST_PROXY: "true" })).toBe("ip:9.9.9.9");
    expect(loginClientKey(h({ "x-forwarded-for": "6.6.6.6, 10.0.0.2" }), { TRUST_PROXY: "true" })).toBe("ip:10.0.0.2");
    expect(loginClientKey(h({}), { TRUST_PROXY: "true" })).toBe("direct");
  });
});

describe("login throttling", () => {
  beforeEach(() => resetLoginThrottle());

  it("blocks a key after repeated failures and only counts failures", () => {
    for (let i = 0; i < MAX_FAILURES_PER_KEY; i++) {
      expect(isLoginBlocked("k")).toBe(false);
      registerLoginFailure("k");
    }
    expect(isLoginBlocked("k")).toBe(true);
    expect(isLoginBlocked("other")).toBe(false);
    clearLoginFailures("k");
    expect(isLoginBlocked("k")).toBe(false);
  });

  it("caps distributed attempts with a global limit (rotating keys/headers doesn't help)", () => {
    for (let i = 0; i < MAX_FAILURES_GLOBAL; i++) registerLoginFailure(`spoofed-${i}`);
    expect(isLoginBlocked("brand-new-key")).toBe(true);
  });

  it("expires failures after the window", () => {
    const t0 = Date.now();
    for (let i = 0; i < MAX_FAILURES_PER_KEY; i++) registerLoginFailure("k", t0);
    expect(isLoginBlocked("k", t0)).toBe(true);
    expect(isLoginBlocked("k", t0 + 16 * 60 * 1000)).toBe(false);
  });
});

describe("post-login redirect", () => {
  it("only allows same-app relative paths", () => {
    expect(safeRedirectPath("/opportunities?x=1")).toBe("/opportunities?x=1");
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/%0d%0aSet-Cookie:x", "", null, "evil.com", "/\tevil"]) {
      const r = safeRedirectPath(bad as string);
      expect(r.startsWith("//") || /^[a-z]+:/i.test(r)).toBe(false);
    }
    expect(safeRedirectPath("//evil.com")).toBe("/");
    expect(safeRedirectPath("/\\evil.com")).toBe("/");
  });
});
