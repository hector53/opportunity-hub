import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "@/server/db/client";

/** Keep a safety margin below Upwork's documented 24-hour cache ceiling. */
export const UPWORK_CONTENT_TTL_MS = 23 * 60 * 60 * 1000;
export const EXPIRED_UPWORK_TITLE = "[Contenido de Upwork expirado]";

async function redactUpworkOpportunity(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(schema.opportunitySourceRecords).where(and(eq(schema.opportunitySourceRecords.opportunityId, id), eq(schema.opportunitySourceRecords.sourceKey, "upwork")));
    await tx.delete(schema.opportunityScores).where(eq(schema.opportunityScores.opportunityId, id));
    await tx.delete(schema.riskFlags).where(eq(schema.riskFlags.opportunityId, id));
    await tx
      .update(schema.opportunities)
      .set({
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
        engagementType: "unknown",
        budgetMin: null,
        budgetMax: null,
        budgetCurrency: null,
        budgetPeriod: "unknown",
        hoursPerWeek: null,
        durationText: null,
        sector: null,
        seniority: null,
        skills: [],
        competitorCount: null,
        publishedAt: null,
        confidence: "low",
        provenance: { retention: { kind: "source", note: "Contenido eliminado al vencer o desconectar Upwork MCP" } },
        techFit: null,
        clientFit: null,
        commercialFit: null,
        practicalFit: null,
        overallScore: null,
        scoreConfidence: null,
        geoEligibility: null,
        riskLevel: "none",
        scoredAt: null,
        retentionExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.opportunities.id, id));
  });
}

async function redactRows(rows: { id: string }[]): Promise<number> {
  for (const row of rows) await redactUpworkOpportunity(row.id);
  return rows.length;
}

/**
 * Removes source records and derived data, then leaves a redacted user-owned shell.
 * Status, notes and user tags survive; Upwork title, description, URL, IDs, scores and risks do not.
 */
export async function purgeExpiredUpworkContent(now = new Date()): Promise<number> {
  const expired = await db
    .select({ id: schema.opportunities.id })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.sourceKey, "upwork"), lte(schema.opportunities.retentionExpiresAt, now)));

  return redactRows(expired);
}

/** Deletes active cached Upwork results when the user disconnects the app. */
export async function purgeCachedUpworkContent(): Promise<number> {
  const cached = await db
    .select({ id: schema.opportunities.id })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.sourceKey, "upwork"), isNotNull(schema.opportunities.retentionExpiresAt)));
  return redactRows(cached);
}
