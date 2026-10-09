import { and, eq } from "drizzle-orm";
import { db, schema, type Tx } from "@/server/db/client";
import type { AppSettings } from "@/features/settings/types";
import { detectRisks, riskLevelFor } from "@/server/security/risk-rules";
import { scoreOpportunity } from "./engine";

type Opp = typeof schema.opportunities.$inferSelect;

/** Recomputes deterministic score + rule-based risk flags and persists both (history kept in opportunity_scores). */
export async function rescoreOpportunity(opp: Opp, settings: AppSettings, tx?: Tx) {
  const conn = tx ?? db;
  const result = scoreOpportunity(
    {
      title: opp.title,
      description: opp.description,
      skills: opp.skills,
      clientType: opp.clientType,
      sector: opp.sector,
      engagementType: opp.engagementType,
      budgetMin: opp.budgetMin,
      budgetMax: opp.budgetMax,
      budgetCurrency: opp.budgetCurrency,
      budgetPeriod: opp.budgetPeriod,
      hoursPerWeek: opp.hoursPerWeek,
      durationText: opp.durationText,
      seniority: opp.seniority,
      language: opp.language,
      remote: opp.remote,
      remoteModality: opp.remoteModality,
      countries: opp.countries,
      competitorCount: opp.competitorCount,
    },
    settings,
  );

  // Risk flags: keep dismissed rule flags (user decision), replace the rest.
  const existing = await conn
    .select()
    .from(schema.riskFlags)
    .where(and(eq(schema.riskFlags.opportunityId, opp.id), eq(schema.riskFlags.detectedBy, "rules")));
  const dismissedRules = new Set(existing.filter((f) => f.dismissed).map((f) => f.rule));
  await conn
    .delete(schema.riskFlags)
    .where(and(eq(schema.riskFlags.opportunityId, opp.id), eq(schema.riskFlags.detectedBy, "rules"), eq(schema.riskFlags.dismissed, false)));
  const findings = detectRisks(`${opp.title}\n${opp.description}`).filter((f) => !dismissedRules.has(f.rule));
  if (findings.length) {
    await conn.insert(schema.riskFlags).values(findings.map((f) => ({ ...f, opportunityId: opp.id, detectedBy: "rules" })));
  }
  const otherActive = await conn
    .select({ severity: schema.riskFlags.severity })
    .from(schema.riskFlags)
    .where(and(eq(schema.riskFlags.opportunityId, opp.id), eq(schema.riskFlags.dismissed, false)));
  const riskLevel = riskLevelFor(otherActive);

  await conn.insert(schema.opportunityScores).values({
    opportunityId: opp.id,
    method: "deterministic",
    version: result.version,
    techFit: result.tech.score,
    clientFit: result.client.score,
    commercialFit: result.commercial.score,
    practicalFit: result.practical.score,
    overall: result.overall,
    reasons: {
      tech: result.tech,
      client: result.client,
      commercial: result.commercial,
      practical: result.practical,
      overallNote: result.overallNote,
    },
  });
  await conn
    .update(schema.opportunities)
    .set({
      techFit: result.tech.score,
      clientFit: result.client.score,
      commercialFit: result.commercial.score,
      practicalFit: result.practical.score,
      overallScore: result.overall,
      riskLevel,
      scoredAt: new Date(),
    })
    .where(eq(schema.opportunities.id, opp.id));
  return { result, riskLevel };
}
