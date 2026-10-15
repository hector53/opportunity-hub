import { and, eq, inArray, isNotNull, lte, ne, or } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { isUpworkContentExpired, redactedUpworkOpportunityFields } from "./retention-policy";

export { EXPIRED_UPWORK_TITLE, UPWORK_CONTENT_TTL_MS } from "./retention-policy";

async function redactUpworkOpportunity(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ companyId: schema.opportunities.companyId })
      .from(schema.opportunities)
      .where(eq(schema.opportunities.id, id))
      .limit(1);
    const applications = await tx
      .select({ id: schema.applications.id })
      .from(schema.applications)
      .where(eq(schema.applications.opportunityId, id));
    const applicationIds = applications.map((row) => row.id);
    const proposals = await tx
      .select({ id: schema.proposalDrafts.id })
      .from(schema.proposalDrafts)
      .where(eq(schema.proposalDrafts.opportunityId, id));
    const proposalIds = proposals.map((row) => row.id);
    const messages = await tx
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.sourceKey, "upwork"),
          applicationIds.length
            ? or(eq(schema.messages.opportunityId, id), inArray(schema.messages.applicationId, applicationIds))
            : eq(schema.messages.opportunityId, id),
        ),
      );
    const messageIds = messages.map((row) => row.id);

    await tx.delete(schema.opportunitySourceRecords).where(and(eq(schema.opportunitySourceRecords.opportunityId, id), eq(schema.opportunitySourceRecords.sourceKey, "upwork")));
    await tx.delete(schema.opportunityScores).where(eq(schema.opportunityScores.opportunityId, id));
    await tx.delete(schema.riskFlags).where(eq(schema.riskFlags.opportunityId, id));
    await tx.delete(schema.aiCalls).where(eq(schema.aiCalls.opportunityId, id));
    await tx.delete(schema.proposalDrafts).where(eq(schema.proposalDrafts.opportunityId, id));
    if (applicationIds.length) await tx.delete(schema.applicationEvents).where(inArray(schema.applicationEvents.applicationId, applicationIds));
    if (messageIds.length) await tx.delete(schema.messages).where(inArray(schema.messages.id, messageIds));

    const activityConditions = [and(eq(schema.activityLog.entityType, "opportunity"), eq(schema.activityLog.entityId, id))];
    if (applicationIds.length) activityConditions.push(and(eq(schema.activityLog.entityType, "application"), inArray(schema.activityLog.entityId, applicationIds)));
    if (proposalIds.length) activityConditions.push(and(eq(schema.activityLog.entityType, "proposal"), inArray(schema.activityLog.entityId, proposalIds)));
    if (messageIds.length) activityConditions.push(and(eq(schema.activityLog.entityType, "message"), inArray(schema.activityLog.entityId, messageIds)));
    await tx.delete(schema.activityLog).where(or(...activityConditions));

    await tx.update(schema.opportunities).set(redactedUpworkOpportunityFields(id)).where(eq(schema.opportunities.id, id));

    // Company rows created only for this temporary result must not retain its name/details.
    if (current?.companyId) {
      const [other] = await tx
        .select({ id: schema.opportunities.id })
        .from(schema.opportunities)
        .where(and(eq(schema.opportunities.companyId, current.companyId), ne(schema.opportunities.id, id)))
        .limit(1);
      if (!other) await tx.delete(schema.companies).where(eq(schema.companies.id, current.companyId));
    }
  });
}

async function redactRows(rows: { id: string }[]): Promise<number> {
  for (const row of rows) await redactUpworkOpportunity(row.id);
  return rows.length;
}

/**
 * Removes source records and derived data, then leaves a redacted user-owned shell.
 * Status, notes and user tags survive; source content, derived proposals and related logs do not.
 */
export async function purgeExpiredUpworkContent(now = new Date()): Promise<number> {
  await db.delete(schema.upworkOAuthTransactions).where(lte(schema.upworkOAuthTransactions.expiresAt, now));
  const expired = await db
    .select({ id: schema.opportunities.id, retentionExpiresAt: schema.opportunities.retentionExpiresAt })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.sourceKey, "upwork"), lte(schema.opportunities.retentionExpiresAt, now)));

  return redactRows(expired.filter((row) => isUpworkContentExpired(row.retentionExpiresAt, now)));
}

/** Deletes active cached Upwork results when the user disconnects the app. */
export async function purgeCachedUpworkContent(): Promise<number> {
  const cached = await db
    .select({ id: schema.opportunities.id })
    .from(schema.opportunities)
    .where(and(eq(schema.opportunities.sourceKey, "upwork"), isNotNull(schema.opportunities.retentionExpiresAt)));
  return redactRows(cached);
}
