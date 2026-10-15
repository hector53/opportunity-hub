export const UPWORK_CONTENT_TTL_MS = 23 * 60 * 60 * 1000;
export const EXPIRED_UPWORK_TITLE = "[Contenido de Upwork expirado]";

export interface UpworkSourceVersion {
  id: string | number;
  retentionExpiresAt: Date | null;
}

export function isUpworkContentExpired(expiresAt: Date | null, now = new Date()): boolean {
  return expiresAt != null && expiresAt.getTime() <= now.getTime();
}

/**
 * A source-record version has its own retention deadline. An opportunity is
 * redacted only when its current aggregate deadline has also expired.
 */
export function planUpworkVersionPurge(versions: readonly UpworkSourceVersion[], currentOpportunityExpiresAt: Date | null, now = new Date()) {
  return {
    expiredSourceRecordIds: versions.filter((version) => isUpworkContentExpired(version.retentionExpiresAt, now)).map((version) => version.id),
    redactOpportunity: isUpworkContentExpired(currentOpportunityExpiresAt, now),
  };
}

/** Values intentionally contain no source title, URL, identifier, snippet or score evidence. */
export function redactedUpworkOpportunityFields(id: string) {
  return {
    externalId: null,
    originalUrl: null,
    dedupeKey: `upwork:expired:${id}`,
    fingerprint: `upwork:expired:${id}`,
    possibleDuplicateOfId: null,
    title: EXPIRED_UPWORK_TITLE,
    description: "",
    companyId: null,
    companyName: null,
    location: null,
    countries: [],
    remote: null,
    remoteModality: null,
    language: null,
    engagementType: "unknown" as const,
    budgetMin: null,
    budgetMax: null,
    budgetCurrency: null,
    budgetPeriod: "unknown" as const,
    hoursPerWeek: null,
    durationText: null,
    sector: null,
    seniority: null,
    skills: [],
    competitorCount: null,
    publishedAt: null,
    confidence: "low" as const,
    provenance: { retention: { kind: "source" as const, note: "Contenido eliminado al vencer o desconectar Upwork MCP" } },
    techFit: null,
    clientFit: null,
    commercialFit: null,
    practicalFit: null,
    overallScore: null,
    scoreConfidence: null,
    geoEligibility: null,
    riskLevel: "none" as const,
    scoredAt: null,
    retentionExpiresAt: null,
    updatedAt: new Date(),
  };
}
