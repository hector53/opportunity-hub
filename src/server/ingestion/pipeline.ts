import { and, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { AppSettings } from "@/features/settings/types";
import { sha256, stableStringify } from "@/lib/hash";
import { dedupeKeyFor, fingerprintFor } from "@/server/deduplication/keys";
import { normalizeName } from "@/server/normalization/text";
import type { NormalizedOpportunity } from "@/server/normalization/types";
import { rescoreOpportunity } from "@/server/scoring/persist";
import { preserveManualEdits } from "./merge";
import { logActivity } from "@/server/services/activity";

export type IngestOutcome = "created" | "updated" | "unchanged";

export interface IngestResult {
  id: string;
  outcome: IngestOutcome;
  possibleDuplicateOfId: string | null;
}

/** Fields owned by the source. User-owned fields (status, tags, notes, discard reason) are never overwritten. */
function sourceFields(n: NormalizedOpportunity) {
  return {
    title: n.title,
    description: n.description,
    companyName: n.company?.name ?? null,
    location: n.location,
    countries: n.countries,
    remote: n.remote,
    remoteModality: n.remoteModality,
    language: n.language,
    engagementType: n.engagementType,
    budgetMin: n.budgetMin,
    budgetMax: n.budgetMax,
    budgetCurrency: n.budgetCurrency,
    budgetPeriod: n.budgetPeriod,
    hoursPerWeek: n.hoursPerWeek,
    durationText: n.durationText,
    sector: n.sector,
    seniority: n.seniority,
    skills: n.skills,
    competitorCount: n.competitorCount,
    publishedAt: n.publishedAt,
    confidence: n.confidence,
    provenance: n.provenance,
    originalUrl: n.originalUrl,
    retentionExpiresAt: n.retentionExpiresAt ?? null,
  };
}

async function upsertCompany(n: NormalizedOpportunity, tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  if (!n.company?.name) return null;
  const normalizedName = normalizeName(n.company.name);
  if (!normalizedName) return null;
  const [row] = await tx
    .insert(schema.companies)
    .values({
      name: n.company.name,
      normalizedName,
      website: n.company.website ?? null,
      country: n.company.country ?? null,
      description: n.company.description ?? null,
      clientType: n.clientType,
      clientTypeInferred: n.provenance.clientType?.kind !== "manual",
      isDemo: n.isDemo,
    })
    .onConflictDoUpdate({
      target: schema.companies.normalizedName,
      // Only fill blanks; never override a client type the user set manually.
      set: {
        website: sql`coalesce(${schema.companies.website}, excluded.website)`,
        country: sql`coalesce(${schema.companies.country}, excluded.country)`,
        description: sql`coalesce(${schema.companies.description}, excluded.description)`,
        clientType: sql`case when ${schema.companies.clientTypeInferred} and ${schema.companies.clientType} = 'unknown' then excluded.client_type else ${schema.companies.clientType} end`,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

/**
 * Idempotent ingestion: normalize → dedupe → upsert → provenance record → score + risks.
 * Running the same payload twice yields "unchanged" and creates no duplicate rows.
 */
export async function ingestOpportunity(
  n: NormalizedOpportunity,
  settings: AppSettings,
  ctx: { syncRunId?: number | null; actor?: "user" | "system" } = {},
): Promise<IngestResult> {
  const dedupeKey = dedupeKeyFor(n);
  const fingerprint = fingerprintFor(n);
  // Retention is local cache metadata, not source content; it must not create a
  // new source-record version on every repeated search.
  const payloadHash = sha256(stableStringify({ ...sourceFields(n), retentionExpiresAt: null, rawPayload: n.rawPayload }));

  const res = await db.transaction(async (tx) => {
    const company = await upsertCompany(n, tx);
    // A user-confirmed company client type beats an inference from this payload.
    const clientType = company && !company.clientTypeInferred ? company.clientType : n.clientType;

    const existing = await tx.query.opportunities.findFirst({ where: eq(schema.opportunities.dedupeKey, dedupeKey) });

    let id: string;
    let outcome: IngestOutcome;
    if (!existing) {
      const dup = await tx.query.opportunities.findFirst({
        where: and(eq(schema.opportunities.fingerprint, fingerprint), ne(schema.opportunities.dedupeKey, dedupeKey)),
        columns: { id: true },
      });
      const [row] = await tx
        .insert(schema.opportunities)
        .values({
          ...sourceFields(n),
          clientType,
          sourceKey: n.sourceKey,
          ingestionMethod: n.ingestionMethod,
          externalId: n.externalId,
          dedupeKey,
          fingerprint,
          possibleDuplicateOfId: dup?.id ?? null,
          companyId: company?.id ?? null,
          tags: n.tags,
          isDemo: n.isDemo,
        })
        .onConflictDoNothing({ target: schema.opportunities.dedupeKey })
        .returning({ id: schema.opportunities.id });
      if (!row) {
        // Lost a race with a concurrent ingestion of the same item.
        const again = await tx.query.opportunities.findFirst({ where: eq(schema.opportunities.dedupeKey, dedupeKey) });
        return { id: again!.id, outcome: "unchanged" as const, possibleDuplicateOfId: again!.possibleDuplicateOfId };
      }
      id = row.id;
      outcome = "created";
    } else {
      id = existing.id;
      const already = await tx.query.opportunitySourceRecords.findFirst({
        where: and(eq(schema.opportunitySourceRecords.opportunityId, id), eq(schema.opportunitySourceRecords.payloadHash, payloadHash)),
        columns: { id: true },
      });
      if (already) {
        await tx
          .update(schema.opportunities)
          .set({ retentionExpiresAt: n.retentionExpiresAt ?? null, updatedAt: new Date() })
          .where(eq(schema.opportunities.id, id));
        await tx
          .update(schema.opportunitySourceRecords)
          .set({ retentionExpiresAt: n.retentionExpiresAt ?? null, fetchedAt: new Date() })
          .where(eq(schema.opportunitySourceRecords.id, already.id));
        return { id, outcome: "unchanged" as const, possibleDuplicateOfId: existing.possibleDuplicateOfId };
      }
      await tx
        .update(schema.opportunities)
        .set({ ...preserveManualEdits(existing, { ...sourceFields(n), clientType }), companyId: company?.id ?? existing.companyId })
        .where(eq(schema.opportunities.id, id));
      outcome = "updated";
    }

    await tx
      .insert(schema.opportunitySourceRecords)
      .values({
        opportunityId: id,
        sourceKey: n.sourceKey,
        ingestionMethod: n.ingestionMethod,
        externalId: n.externalId,
        url: n.originalUrl,
        payloadHash,
        rawPayload: n.rawPayload ?? null,
        syncRunId: ctx.syncRunId ?? null,
        retentionExpiresAt: n.retentionExpiresAt ?? null,
      })
      .onConflictDoNothing();

    const fresh = await tx.query.opportunities.findFirst({ where: eq(schema.opportunities.id, id) });
    await rescoreOpportunity(fresh!, settings, tx);

    if (outcome === "created") {
      await logActivity(
        {
          entityType: "opportunity",
          entityId: id,
          action: "imported",
          summary: n.sourceKey === "upwork" ? "Importada oportunidad de Upwork MCP (contenido temporal)" : `Importada${n.isDemo ? " (Demo)" : ""}: ${n.title}`,
          actor: ctx.actor ?? "system",
          metadata: { source: n.sourceKey, method: n.ingestionMethod },
        },
        tx,
      );
    }
    return { id, outcome, possibleDuplicateOfId: fresh!.possibleDuplicateOfId };
  });
  return res;
}
