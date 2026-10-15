import { eq } from "drizzle-orm";
import { db, schema, sqlClient } from "@/server/db/client";
import { getUpworkOAuthConfig } from "./config";
import { refreshAccessToken, revokeUpworkToken, type UpworkTokenSet } from "./oauth";
import { purgeCachedUpworkContent } from "./retention";
import { decryptSecret } from "./secure";
import { UPWORK_ADVISORY_LOCK_ID } from "./lock";
import { buildUpworkTokenWritePlan, type UpworkTokenSaveMode } from "./token-merge";

const ACCESS_PURPOSE = "opportunity-hub:upwork-access-token";
const REFRESH_PURPOSE = "opportunity-hub:upwork-refresh-token";
const REFRESH_MARGIN_MS = 60_000;

export type UpworkConnection = typeof schema.upworkConnections.$inferSelect;

export async function getUpworkConnection(): Promise<UpworkConnection | null> {
  return (await db.query.upworkConnections.findFirst({ where: eq(schema.upworkConnections.id, 1) })) ?? null;
}

function expiresSoon(expiresAt: Date | null, now = Date.now()): boolean {
  return expiresAt != null && expiresAt.getTime() <= now + REFRESH_MARGIN_MS;
}

export async function saveUpworkTokenSet(
  tokens: UpworkTokenSet,
  config = getUpworkOAuthConfig(),
  options: { mode?: UpworkTokenSaveMode; orgUid?: string | null } = {},
) {
  const existing = await getUpworkConnection();
  const mode = options.mode ?? "reauthorize";
  const plan = buildUpworkTokenWritePlan(tokens, config, existing, { mode, orgUid: options.orgUid });
  await db
    .insert(schema.upworkConnections)
    .values({
      id: 1,
      status: "connected",
      accessTokenCiphertext: plan.accessTokenCiphertext,
      refreshTokenCiphertext: plan.refreshTokenCiphertext,
      accessTokenExpiresAt: plan.accessTokenExpiresAt,
      refreshTokenExpiresAt: plan.refreshTokenExpiresAt,
      scope: plan.scope,
      orgUid: plan.orgUid,
      lastError: null,
      connectedAt: plan.connectedAt,
      revokedAt: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.upworkConnections.id,
      set: {
        status: "connected",
        accessTokenCiphertext: plan.accessTokenCiphertext,
        refreshTokenCiphertext: plan.refreshTokenCiphertext,
        accessTokenExpiresAt: plan.accessTokenExpiresAt,
        refreshTokenExpiresAt: plan.refreshTokenExpiresAt,
        scope: plan.scope,
        orgUid: plan.orgUid,
        lastError: null,
        connectedAt: plan.connectedAt,
        revokedAt: null,
        updatedAt: new Date(),
      },
    });
}

async function refreshStoredToken(connection: UpworkConnection, config: ReturnType<typeof getUpworkOAuthConfig>): Promise<string> {
  if (!connection.refreshTokenCiphertext) {
    await markUpworkError("La conexión Upwork no tiene refresh token; vuelve a autorizarla");
    throw new Error("La conexión Upwork no tiene refresh token; vuelve a autorizarla");
  }
  if (connection.refreshTokenExpiresAt && connection.refreshTokenExpiresAt.getTime() <= Date.now()) {
    await markUpworkError("El refresh token de Upwork expiró; vuelve a autorizarla");
    throw new Error("El refresh token de Upwork expiró; vuelve a autorizarla");
  }
  let refreshToken: string;
  try {
    refreshToken = decryptSecret(connection.refreshTokenCiphertext, config.tokenEncryptionKey, REFRESH_PURPOSE);
  } catch {
    await markUpworkError("No se pudo descifrar la credencial Upwork");
    throw new Error("No se pudo descifrar la credencial Upwork");
  }
  try {
    const tokens = await refreshAccessToken(config, refreshToken);
    await saveUpworkTokenSet(tokens, config, { mode: "refresh" });
    return tokens.accessToken;
  } catch (error) {
    await db.update(schema.upworkConnections).set({ status: "error", lastError: "No se pudo renovar el token Upwork", updatedAt: new Date() }).where(eq(schema.upworkConnections.id, 1));
    throw error;
  }
}

export async function getUpworkAccessToken(options: { forceRefresh?: boolean } = {}): Promise<{ token: string; connection: UpworkConnection }> {
  const connection = await getUpworkConnection();
  if (!connection || connection.status !== "connected") throw new Error("Upwork no está conectado");
  const config = getUpworkOAuthConfig();
  if (!options.forceRefresh && !expiresSoon(connection.accessTokenExpiresAt)) {
    try {
      return { token: decryptSecret(connection.accessTokenCiphertext, config.tokenEncryptionKey, ACCESS_PURPOSE), connection };
    } catch {
      await markUpworkError("No se pudo descifrar la credencial Upwork");
      throw new Error("No se pudo descifrar la credencial Upwork");
    }
  }
  const token = await refreshStoredToken(connection, config);
  const refreshed = await getUpworkConnection();
  return { token, connection: refreshed ?? connection };
}

export async function markUpworkUsed() {
  await db.update(schema.upworkConnections).set({ lastUsedAt: new Date(), updatedAt: new Date() }).where(eq(schema.upworkConnections.id, 1));
}

export async function markUpworkError(message: string) {
  await db.update(schema.upworkConnections).set({ status: "error", lastError: message, updatedAt: new Date() }).where(eq(schema.upworkConnections.id, 1));
}

export async function setUpworkOrgUid(orgUid: string) {
  await db.update(schema.upworkConnections).set({ orgUid, updatedAt: new Date() }).where(eq(schema.upworkConnections.id, 1));
}

/** Revokes upstream when possible, then always removes local tokens. */
export async function disconnectUpwork(): Promise<{ remoteRevoked: boolean; redacted: number }> {
  const conn = await sqlClient.reserve();
  try {
    await conn`select pg_advisory_lock(${UPWORK_ADVISORY_LOCK_ID})`;
    try {
      const connection = await getUpworkConnection();
      if (!connection) {
        const redacted = await purgeCachedUpworkContent();
        await db.update(schema.sources).set({ status: "pending_credentials", lastError: null, importedCount: 0 }).where(eq(schema.sources.key, "upwork"));
        return { remoteRevoked: true, redacted };
      }
      let remoteRevoked = false;
      try {
        const config = getUpworkOAuthConfig();
        const token = connection.refreshTokenCiphertext
          ? decryptSecret(connection.refreshTokenCiphertext, config.tokenEncryptionKey, REFRESH_PURPOSE)
          : decryptSecret(connection.accessTokenCiphertext, config.tokenEncryptionKey, ACCESS_PURPOSE);
        remoteRevoked = await revokeUpworkToken(config, token);
      } catch {
        // Local deletion is still mandatory even if the remote revoke endpoint is unavailable.
      }
      let redacted = 0;
      try {
        redacted = await purgeCachedUpworkContent();
      } finally {
        await db.delete(schema.upworkConnections).where(eq(schema.upworkConnections.id, 1));
        // Keep the source disabled for new searches before releasing the shared lock.
        await db.update(schema.sources).set({ status: "pending_credentials", lastError: null, importedCount: 0 }).where(eq(schema.sources.key, "upwork"));
      }
      return { remoteRevoked, redacted };
    } finally {
      await conn`select pg_advisory_unlock(${UPWORK_ADVISORY_LOCK_ID})`;
    }
  } finally {
    conn.release();
  }
}
