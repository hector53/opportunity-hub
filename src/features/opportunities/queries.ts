import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { OpportunityFilters } from "./filters";

const o = schema.opportunities;

export const PAGE_SIZE = 50;

function likeEscape(s: string) {
  return `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Approximate hourly rate in the configured currency, for filtering/sorting. Fixed-price, unknown
 * periods and budgets in any other currency (or without currency) yield NULL — no implicit conversion.
 */
export const hourlyExpr = (currency: string) => sql<number | null>`case when ${o.budgetCurrency} is distinct from ${currency.toUpperCase()} then null
  when ${o.budgetPeriod} = 'hour' then coalesce(${o.budgetMax}, ${o.budgetMin})
  when ${o.budgetPeriod} = 'month' then coalesce(${o.budgetMax}, ${o.budgetMin}) / 160.0
  when ${o.budgetPeriod} = 'year' then coalesce(${o.budgetMax}, ${o.budgetMin}) / 1920.0
  else null end`;

export const RECOMMENDED_MIN_SCORE = 70;

/**
 * Single definition of "recommended", shared by the dashboard count, its list and the table filter:
 * open status, score ≥ 70 with Technology known, confidence medium/high, not geographically
 * ineligible, and no high risk. Low-confidence scores are never presented as a confirmed fit.
 */
export function recommendedWhere(): SQL {
  return and(
    inArray(o.status, ["new", "reviewing"]),
    gte(o.overallScore, RECOMMENDED_MIN_SCORE),
    isNotNull(o.techFit),
    inArray(o.scoreConfidence, ["high", "medium"]),
    sql`${o.geoEligibility} is distinct from 'ineligible'`,
    ne(o.riskLevel, "high"),
  )!;
}

export function buildWhere(f: OpportunityFilters, currency = "USD"): SQL | undefined {
  const c: (SQL | undefined)[] = [];
  if (f.q) {
    const p = likeEscape(f.q);
    c.push(or(ilike(o.title, p), ilike(o.description, p), ilike(o.companyName, p)));
  }
  if (f.source.length) c.push(inArray(o.sourceKey, f.source));
  if (f.engagement.length) c.push(inArray(o.engagementType, f.engagement as (typeof o.engagementType.enumValues)[number][]));
  if (f.clientType.length) c.push(inArray(o.clientType, f.clientType as (typeof o.clientType.enumValues)[number][]));
  if (f.status.length) c.push(inArray(o.status, f.status as (typeof o.status.enumValues)[number][]));
  else c.push(notInArray(o.status, ["discarded", "archived"]));
  if (f.language.length) {
    const langs = f.language.filter((l) => l !== "unknown");
    c.push(or(langs.length ? inArray(o.language, langs) : undefined, f.language.includes("unknown") ? isNull(o.language) : undefined));
  }
  if (f.risk.length) c.push(inArray(o.riskLevel, f.risk as (typeof o.riskLevel.enumValues)[number][]));
  if (f.minBudget != null) c.push(sql`${hourlyExpr(currency)} >= ${f.minBudget}`);
  if (f.recommended) c.push(recommendedWhere());
  if (f.eligibility.length) {
    const vals = f.eligibility.filter((v) => v !== "unknown") as (typeof o.geoEligibility.enumValues)[number][];
    c.push(or(vals.length ? inArray(o.geoEligibility, vals) : undefined, f.eligibility.includes("unknown") ? isNull(o.geoEligibility) : undefined));
  }
  if (f.confidence.length) c.push(inArray(o.scoreConfidence, f.confidence as (typeof o.scoreConfidence.enumValues)[number][]));
  if (f.minScore != null) c.push(gte(o.overallScore, f.minScore));
  if (f.stack) {
    const terms = f.stack.split(/[,\s]+/).filter(Boolean);
    for (const t of terms) c.push(or(sql`${o.skills}::text ilike ${likeEscape(t)}`, ilike(o.title, likeEscape(t))));
  }
  if (f.sector) c.push(ilike(o.sector, likeEscape(f.sector)));
  if (f.country) c.push(or(sql`${o.countries}::text ilike ${likeEscape(f.country)}`, ilike(o.location, likeEscape(f.country))));
  if (f.maxAgeDays != null) c.push(sql`coalesce(${o.publishedAt}, ${o.createdAt}) >= now() - make_interval(days => ${Math.round(f.maxAgeDays)})`);
  if (f.demo === "exclude") c.push(eq(o.isDemo, false));
  if (f.demo === "only") c.push(eq(o.isDemo, true));
  return and(...c.filter(Boolean));
}

function orderBy(f: OpportunityFilters, currency: string) {
  switch (f.sort) {
    case "published":
      return [sql`coalesce(${o.publishedAt}, ${o.createdAt}) desc`];
    case "created":
      return [desc(o.createdAt)];
    case "budget":
      return [sql`${hourlyExpr(currency)} desc nulls last`];
    default:
      return [sql`${o.overallScore} desc nulls last`, desc(o.createdAt)];
  }
}

export async function listOpportunities(f: OpportunityFilters, currency = "USD") {
  const where = buildWhere(f, currency);
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: o.id,
        title: o.title,
        sourceKey: o.sourceKey,
        companyName: o.companyName,
        clientType: o.clientType,
        location: o.location,
        remote: o.remote,
        language: o.language,
        budgetMin: o.budgetMin,
        budgetMax: o.budgetMax,
        budgetCurrency: o.budgetCurrency,
        budgetPeriod: o.budgetPeriod,
        engagementType: o.engagementType,
        publishedAt: o.publishedAt,
        createdAt: o.createdAt,
        techFit: o.techFit,
        clientFit: o.clientFit,
        commercialFit: o.commercialFit,
        practicalFit: o.practicalFit,
        overallScore: o.overallScore,
        scoreConfidence: o.scoreConfidence,
        geoEligibility: o.geoEligibility,
        riskLevel: o.riskLevel,
        status: o.status,
        isDemo: o.isDemo,
        originalUrl: o.originalUrl,
        possibleDuplicateOfId: o.possibleDuplicateOfId,
        provenance: o.provenance,
      })
      .from(o)
      .where(where)
      .orderBy(...orderBy(f, currency))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(o).where(where),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export type OpportunityRow = Awaited<ReturnType<typeof listOpportunities>>["rows"][number];

export async function getOpportunityDetail(id: string) {
  const opp = await db.query.opportunities.findFirst({ where: eq(o.id, id) });
  if (!opp) return null;
  const [company, records, score, risks, application, proposals, messages, duplicate, duplicates] = await Promise.all([
    opp.companyId ? db.query.companies.findFirst({ where: eq(schema.companies.id, opp.companyId) }) : null,
    db
      .select({
        id: schema.opportunitySourceRecords.id,
        sourceKey: schema.opportunitySourceRecords.sourceKey,
        ingestionMethod: schema.opportunitySourceRecords.ingestionMethod,
        url: schema.opportunitySourceRecords.url,
        fetchedAt: schema.opportunitySourceRecords.fetchedAt,
        syncRunId: schema.opportunitySourceRecords.syncRunId,
      })
      .from(schema.opportunitySourceRecords)
      .where(eq(schema.opportunitySourceRecords.opportunityId, id))
      .orderBy(desc(schema.opportunitySourceRecords.fetchedAt))
      .limit(10),
    db.query.opportunityScores.findFirst({ where: eq(schema.opportunityScores.opportunityId, id), orderBy: desc(schema.opportunityScores.createdAt) }),
    db.select().from(schema.riskFlags).where(eq(schema.riskFlags.opportunityId, id)).orderBy(asc(schema.riskFlags.dismissed), desc(schema.riskFlags.severity)),
    db.query.applications.findFirst({ where: eq(schema.applications.opportunityId, id) }),
    db.select().from(schema.proposalDrafts).where(eq(schema.proposalDrafts.opportunityId, id)).orderBy(desc(schema.proposalDrafts.version)),
    db.select().from(schema.messages).where(eq(schema.messages.opportunityId, id)).orderBy(desc(schema.messages.receivedAt)),
    opp.possibleDuplicateOfId ? db.query.opportunities.findFirst({ where: eq(o.id, opp.possibleDuplicateOfId), columns: { id: true, title: true, sourceKey: true } }) : null,
    db.select({ id: o.id, title: o.title, sourceKey: o.sourceKey }).from(o).where(and(eq(o.possibleDuplicateOfId, id), ne(o.id, id))),
  ]);
  const events = application
    ? await db.select().from(schema.applicationEvents).where(eq(schema.applicationEvents.applicationId, application.id)).orderBy(desc(schema.applicationEvents.createdAt))
    : [];
  return { opp, company, records, score, risks, application, events, proposals, messages, duplicate, duplicates };
}

export async function listPresets() {
  return db.select().from(schema.searchPresets).orderBy(asc(schema.searchPresets.name));
}
