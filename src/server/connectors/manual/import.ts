import { z } from "zod";
import {
  detectLanguage,
  extractSkills,
  inferClientType,
  inferEngagement,
  inferHoursPerWeek,
  inferSector,
  normalizeUrl,
  parseBudgetFromText,
} from "@/server/normalization/text";
import type { FieldProvenance, NormalizedOpportunity } from "@/server/normalization/types";

const blankToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optText = z.preprocess(blankToUndef, z.string().trim().max(500).optional());
const optNum = z.preprocess(blankToUndef, z.coerce.number().nonnegative().max(10_000_000).optional());

export const MANUAL_SOURCES = ["workana", "upwork", "getonboard", "manual"] as const;

export const manualImportSchema = z.object({
  sourceKey: z.enum(MANUAL_SOURCES),
  url: z.preprocess(
    blankToUndef,
    z
      .string()
      .trim()
      .url("URL inválida")
      .refine((u) => /^https?:\/\//i.test(u), "Sólo http(s)")
      .optional(),
  ),
  title: z.string().trim().min(3, "Título requerido").max(300),
  description: z.string().trim().max(50_000).default(""),
  companyName: optText,
  clientType: z.preprocess(blankToUndef, z.enum(["founder", "startup", "smb", "agency", "recruiter", "enterprise", "unknown"]).optional()),
  engagementType: z.preprocess(blankToUndef, z.enum(["freelance", "fractional", "contract", "part_time", "full_time", "unknown"]).optional()),
  budgetMin: optNum,
  budgetMax: optNum,
  budgetCurrency: z.preprocess(blankToUndef, z.string().trim().toUpperCase().length(3).optional()),
  budgetPeriod: z.preprocess(blankToUndef, z.enum(["hour", "month", "year", "fixed", "unknown"]).optional()),
  language: z.preprocess(blankToUndef, z.enum(["es", "en", "pt", "other"]).optional()),
  remote: z.preprocess(blankToUndef, z.enum(["yes", "no"]).optional()),
  country: optText,
  hoursPerWeek: z.preprocess(blankToUndef, z.coerce.number().int().min(1).max(80).optional()),
  durationText: optText,
  competitorCount: z.preprocess(blankToUndef, z.coerce.number().int().min(0).max(10000).optional()),
  tags: z.preprocess(blankToUndef, z.string().max(300).optional()),
});

export type ManualImportInput = z.infer<typeof manualImportSchema>;

/** Extracts the job slug from a Get on Board public URL so manual imports dedupe against API-synced items. */
export function getOnBoardIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/getonbrd\.com\/(?:[a-z]{2}\/)?jobs\/(?:[\w-]+\/)?([\w-]+)\/?(?:[?#].*)?$/i);
  return m ? m[1] : null;
}

/**
 * Builds a normalized opportunity from user input. Explicit form values are marked "manual";
 * values guessed from the pasted text are marked "inferred". Nothing is fetched from the URL —
 * linking to Workana/Upwork is stored as a reference only (no scraping).
 */
export function normalizeManualImport(input: ManualImportInput, opts: { isDemo?: boolean } = {}): NormalizedOpportunity {
  const text = `${input.title}\n${input.description}`;
  const provenance: FieldProvenance = { title: { kind: "manual" } };
  if (input.description) provenance.description = { kind: "manual", note: "Texto pegado por el usuario" };

  let clientType = input.clientType ?? "unknown";
  if (input.clientType) provenance.clientType = { kind: "manual" };
  else {
    const inf = inferClientType(text, input.companyName ?? "");
    clientType = inf.value;
    if (inf.value !== "unknown") provenance.clientType = { kind: "inferred", note: `Texto: "${inf.evidence}"` };
  }

  let engagementType = input.engagementType ?? "unknown";
  if (input.engagementType) provenance.engagementType = { kind: "manual" };
  else {
    const inf = inferEngagement(text);
    engagementType = inf.value;
    if (inf.value !== "unknown") provenance.engagementType = { kind: "inferred", note: `Texto: "${inf.evidence}"` };
  }

  let budgetMin = input.budgetMin ?? null;
  let budgetMax = input.budgetMax ?? input.budgetMin ?? null;
  let budgetCurrency = input.budgetCurrency ?? null;
  let budgetPeriod = input.budgetPeriod ?? "unknown";
  if (budgetMin != null || budgetMax != null) {
    provenance.budget = { kind: "manual" };
    budgetCurrency ??= "USD";
  } else {
    const b = parseBudgetFromText(text);
    if (b.min != null) {
      budgetMin = b.min;
      budgetMax = b.max;
      budgetCurrency = b.currency;
      budgetPeriod = b.period;
      provenance.budget = { kind: "inferred", note: `Texto: "${b.evidence}"` };
    }
  }

  let language: string | null = input.language ?? null;
  if (language) provenance.language = { kind: "manual" };
  else {
    language = detectLanguage(text);
    if (language) provenance.language = { kind: "inferred" };
  }

  let remote: boolean | null = input.remote ? input.remote === "yes" : null;
  if (remote !== null) provenance.remote = { kind: "manual" };
  else if (/\b(remote|remoto|100% remot)/i.test(text)) {
    remote = true;
    provenance.remote = { kind: "inferred" };
  } else if (/\b(on-?site|presencial)\b/i.test(text)) {
    remote = false;
    provenance.remote = { kind: "inferred" };
  }

  let hoursPerWeek = input.hoursPerWeek ?? null;
  if (hoursPerWeek) provenance.hoursPerWeek = { kind: "manual" };
  else {
    hoursPerWeek = inferHoursPerWeek(text);
    if (hoursPerWeek) provenance.hoursPerWeek = { kind: "inferred" };
  }

  const sector = inferSector(text);
  if (sector) provenance.sector = { kind: "inferred" };
  if (input.competitorCount != null) provenance.competitorCount = { kind: "manual" };

  const gobId = input.sourceKey === "getonboard" ? getOnBoardIdFromUrl(input.url) : null;
  const tags = (input.tags ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const filled = [input.companyName, input.clientType, input.engagementType, input.budgetMin, input.language, input.remote].filter((v) => v != null).length;

  return {
    sourceKey: input.sourceKey,
    ingestionMethod: input.description.length > 0 && filled < 2 ? "manual_text" : "manual_form",
    externalId: gobId,
    originalUrl: input.url ? (normalizeUrl(input.url) ?? input.url) : null,
    title: input.title,
    description: input.description,
    company: input.companyName ? { name: input.companyName, country: input.country ?? null } : null,
    clientType,
    location: input.country ?? null,
    countries: input.country ? [input.country] : [],
    remote,
    remoteModality: null,
    language,
    engagementType,
    budgetMin,
    budgetMax,
    budgetCurrency,
    budgetPeriod,
    hoursPerWeek,
    durationText: input.durationText ?? null,
    sector,
    seniority: null,
    skills: extractSkills(text),
    competitorCount: input.competitorCount ?? null,
    publishedAt: null,
    tags,
    confidence: filled >= 3 ? "medium" : "low",
    provenance,
    isDemo: opts.isDemo ?? false,
    rawPayload: { input },
  };
}
