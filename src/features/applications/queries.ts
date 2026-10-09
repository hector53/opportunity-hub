import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { APPLICATION_STATUSES, type ApplicationStatus } from "./state-machine";

export async function listApplications(statuses: string[]) {
  const valid = statuses.filter((s): s is ApplicationStatus => (APPLICATION_STATUSES as readonly string[]).includes(s));
  const a = schema.applications;
  const o = schema.opportunities;
  return db
    .select({
      id: a.id,
      status: a.status,
      proposedRate: a.proposedRate,
      rateCurrency: a.rateCurrency,
      ratePeriod: a.ratePeriod,
      appliedAt: a.appliedAt,
      nextFollowUpAt: a.nextFollowUpAt,
      nextStep: a.nextStep,
      updatedAt: a.updatedAt,
      isDemo: a.isDemo,
      experimentVariant: a.experimentVariant,
      opportunityId: o.id,
      title: o.title,
      sourceKey: o.sourceKey,
      companyName: o.companyName,
      overallScore: o.overallScore,
      riskLevel: o.riskLevel,
      originalUrl: o.originalUrl,
      language: o.language,
    })
    .from(a)
    .innerJoin(o, eq(o.id, a.opportunityId))
    .where(valid.length ? inArray(a.status, valid) : undefined)
    .orderBy(desc(a.updatedAt));
}

export type ApplicationRow = Awaited<ReturnType<typeof listApplications>>[number];
