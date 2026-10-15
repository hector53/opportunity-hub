import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "v1";

function keyFor(material: string, purpose: string): Buffer {
  if (!material || material.length < 32) throw new Error("La clave criptográfica debe tener al menos 32 caracteres");
  return createHash("sha256").update(`${purpose}\0${material}`).digest();
}

function b64(value: Buffer): string {
  return value.toString("base64url");
}

function unb64(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

/** AES-256-GCM envelope for OAuth tokens and the short-lived OAuth transaction cookie. */
export function encryptSecret(value: string, material: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(material, purpose), iv);
  cipher.setAAD(Buffer.from(purpose, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [VERSION, b64(iv), b64(cipher.getAuthTag()), b64(ciphertext)].join(".");
}

export function decryptSecret(envelope: string, material: string, purpose: string): string {
  const [version, ivB64, tagB64, ciphertextB64] = envelope.split(".");
  if (version !== VERSION || !ivB64 || !tagB64 || !ciphertextB64) throw new Error("Cifrado OAuth inválido");
  const decipher = createDecipheriv("aes-256-gcm", keyFor(material, purpose), unb64(ivB64));
  decipher.setAAD(Buffer.from(purpose, "utf8"));
  decipher.setAuthTag(unb64(tagB64));
  return Buffer.concat([decipher.update(unb64(ciphertextB64)), decipher.final()]).toString("utf8");
}

export interface OAuthStatePayload {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  issuedAt: number;
}

export function sealOAuthState(payload: OAuthStatePayload, authSecret: string): string {
  return encryptSecret(JSON.stringify(payload), authSecret, "opportunity-hub:upwork-oauth-state");
}

export function openOAuthState(envelope: string, authSecret: string): OAuthStatePayload {
  const raw = decryptSecret(envelope, authSecret, "opportunity-hub:upwork-oauth-state");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("Estado OAuth inválido");
  const value = parsed as Record<string, unknown>;
  if (typeof value.state !== "string" || typeof value.codeVerifier !== "string" || typeof value.redirectUri !== "string" || typeof value.issuedAt !== "number") {
    throw new Error("Estado OAuth incompleto");
  }
  return { state: value.state, codeVerifier: value.codeVerifier, redirectUri: value.redirectUri, issuedAt: value.issuedAt };
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
