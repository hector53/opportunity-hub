import { sha256 } from "@/lib/hash";
import { normalizeName, normalizeUrl } from "@/server/normalization/text";
import type { NormalizedOpportunity } from "@/server/normalization/types";

/**
 * Primary identity of an opportunity, used for idempotent upserts.
 * Priority: source external id → canonical URL → content hash (manual text without link).
 */
export function dedupeKeyFor(o: Pick<NormalizedOpportunity, "sourceKey" | "externalId" | "originalUrl" | "title" | "description" | "company">): string {
  if (o.externalId) return `${o.sourceKey}:id:${o.externalId}`;
  const url = normalizeUrl(o.originalUrl);
  if (url) return `url:${url}`;
  return `${o.sourceKey}:content:${sha256(`${normalizeName(o.title)}|${normalizeName(o.company?.name)}|${normalizeName(o.description).slice(0, 2000)}`).slice(0, 32)}`;
}

/**
 * Cross-source similarity fingerprint (title + company). Matches are flagged as
 * "possible duplicates" for the user to review — never merged automatically.
 */
export function fingerprintFor(o: Pick<NormalizedOpportunity, "title" | "company">): string {
  return sha256(`${normalizeName(o.title)}|${normalizeName(o.company?.name ?? "")}`).slice(0, 32);
}
