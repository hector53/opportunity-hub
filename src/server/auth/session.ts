import { createHash, createHmac, scryptSync, timingSafeEqual, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "oh_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (>= 32 chars)");
  return s;
}

function b64url(buf: Buffer | string) {
  return Buffer.from(buf).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Token = base64url(json{sub,exp}).hmac. Stateless; rotate AUTH_SECRET to revoke all sessions. */
export function createSessionToken(now = Date.now()): string {
  const payload = b64url(JSON.stringify({ sub: "owner", exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS }));
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null, now = Date.now()): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string; exp?: number };
    return data.sub === "owner" && typeof data.exp === "number" && data.exp * 1000 > now;
  } catch {
    return false;
  }
}

/** Non-reversible binding used for short-lived OAuth transactions; never persist the cookie itself. */
export function sessionBinding(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

/**
 * Format: scrypt:<saltB64>:<hashB64> (":" avoids Docker Compose "$" interpolation in env files;
 * the legacy "$" separator is still accepted). Generate with `npm run auth:hash -- 'password'`.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyPassword(password: string): boolean {
  const stored = process.env.APP_PASSWORD_HASH;
  if (stored) {
    const [scheme, saltB64, hashB64] = stored.split(/[:$]/);
    if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
    const expected = Buffer.from(hashB64, "base64");
    const actual = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length);
    return timingSafeEqual(actual, expected);
  }
  const plain = process.env.APP_PASSWORD;
  if (!plain || plain.length < 10) return false;
  // Compare fixed-length digests to avoid leaking length via timing.
  const a = scryptSync(password, "oh-static-compare", 32);
  const b = scryptSync(plain, "oh-static-compare", 32);
  return timingSafeEqual(a, b);
}

/** Demo bypass: only honoured outside production. */
export function authBypassEnabled(): boolean {
  return process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production";
}

export function cookieSecure(): boolean {
  return process.env.COOKIE_SECURE === "true";
}
