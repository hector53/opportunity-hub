import { z } from "zod";

const csv = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v == null ? [] : (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean)));

const optNum = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  });

const optStr = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

/** Filters accepted by the opportunities table (URL search params ↔ saved presets). */
export const opportunityFiltersSchema = z.object({
  q: optStr,
  source: csv,
  engagement: csv,
  clientType: csv,
  status: csv,
  language: csv,
  risk: csv,
  eligibility: csv,
  confidence: csv,
  recommended: z
    .union([z.literal("1"), z.literal("true"), z.literal(""), z.boolean()])
    .optional()
    .transform((v) => v === "1" || v === "true" || v === true || undefined),
  minBudget: optNum, // approx. hourly rate in the configured currency
  minScore: optNum,
  stack: optStr,
  sector: optStr,
  country: optStr,
  maxAgeDays: optNum,
  demo: z.enum(["include", "exclude", "only"]).optional(),
  sort: z.enum(["score", "published", "created", "budget"]).optional(),
  page: optNum,
});

export type OpportunityFilters = z.infer<typeof opportunityFiltersSchema>;

export function parseFilters(params: Record<string, string | string[] | undefined>): OpportunityFilters {
  const parsed = opportunityFiltersSchema.safeParse(params);
  return parsed.success ? parsed.data : opportunityFiltersSchema.parse({});
}

export function filtersToSearchParams(f: Partial<OpportunityFilters>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || k === "page") continue;
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(","));
    } else if (v !== "") sp.set(k, String(v));
  }
  return sp;
}
