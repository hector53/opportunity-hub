import { encryptSecret } from "./secure";
import type { UpworkOAuthConfig } from "./config";
import type { UpworkTokenSet } from "./oauth";

export type UpworkTokenSaveMode = "reauthorize" | "refresh";

export interface ExistingUpworkTokenState {
  refreshTokenCiphertext: string | null;
  refreshTokenExpiresAt: Date | null;
  scope: string | null;
  orgUid: string | null;
  connectedAt: Date;
}

export interface UpworkTokenWritePlan {
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scope: string | null;
  orgUid: string | null;
  connectedAt: Date;
}

/**
 * A reauthorization replaces the complete credential/account context. A refresh is the only
 * operation allowed to retain a refresh token when the provider omits a replacement token.
 */
export function buildUpworkTokenWritePlan(
  tokens: UpworkTokenSet,
  config: Pick<UpworkOAuthConfig, "tokenEncryptionKey">,
  existing: ExistingUpworkTokenState | null,
  options: { mode: UpworkTokenSaveMode; orgUid?: string | null; now?: Date },
): UpworkTokenWritePlan {
  const now = options.now ?? new Date();
  const isRefresh = options.mode === "refresh";
  const hasReplacementRefreshToken = Boolean(tokens.refreshToken);

  return {
    accessTokenCiphertext: encryptSecret(tokens.accessToken, config.tokenEncryptionKey, "opportunity-hub:upwork-access-token"),
    refreshTokenCiphertext: hasReplacementRefreshToken
      ? encryptSecret(tokens.refreshToken!, config.tokenEncryptionKey, "opportunity-hub:upwork-refresh-token")
      : isRefresh
        ? existing?.refreshTokenCiphertext ?? null
        : null,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    refreshTokenExpiresAt: hasReplacementRefreshToken ? tokens.refreshTokenExpiresAt : isRefresh ? existing?.refreshTokenExpiresAt ?? null : null,
    scope: isRefresh ? tokens.scope ?? existing?.scope ?? null : tokens.scope,
    orgUid: isRefresh ? existing?.orgUid ?? null : options.orgUid ?? null,
    connectedAt: isRefresh ? existing?.connectedAt ?? now : now,
  };
}
