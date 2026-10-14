import { z } from "zod";
import { detectLanguage, extractSkills, inferClientType, inferEngagement, inferSector, normalizeUrl } from "@/server/normalization/text";
import type { FieldProvenance, NormalizedOpportunity } from "@/server/normalization/types";

/**
 * Shape returned by the official Upwork MCP `find_jobs` search action.
 * Search results intentionally contain less data than `action=get`; missing
 * values remain unknown and are not guessed here.
 */
export const upworkMcpJobSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string().trim().min(1),
  description_snippet: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  url: z.string().url(),
  budget: z.string().nullable().optional(),
  job_type: z.enum(["fixed", "hourly"]).nullable().optional(),
  experience_level: z.string().nullable().optional(),
  duration: z.string().nullable().optional(),
  engagement: z.string().nullable().optional(),
  skills: z.array(z.string()).optional().default([]),
  proposals_tier: z.string().nullable().optional(),
  freelancers_to_hire: z.number().nullable().optional(),
  created_date: z.string().nullable().optional(),
  published_date: z.string().nullable().optional(),
  applied: z.boolean().nullable().optional(),
  featured: z.boolean().nullable().optional(),
  client: z
    .object({
      country: z.string().nullable().optional(),
      rating: z.number().nullable().optional(),
      total_reviews: z.number().nullable().optional(),
      total_posted_jobs: z.number().nullable().optional(),
      total_spent: z.string().nullable().optional(),
      verification_status: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export type UpworkMcpJob = z.infer<typeof upworkMcpJobSchema>;

function cleanUntrustedMarkers(value: string): string {
  return value
    .replace(/<\/?untrusted_participant_content>/gi, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseBudget(value: string | null | undefined, jobType: UpworkMcpJob["job_type"]): {
  min: number | null;
  max: number | null;
  period: "hour" | "fixed" | "unknown";
} {
  if (!value) return { min: null, max: null, period: "unknown" };
  const amounts = value.match(/\d[\d,]*(?:\.\d+)?/g)?.map((token) => Number(token.replace(/,/g, ""))) ?? [];
  const valid = amounts.filter((amount) => Number.isFinite(amount) && amount > 0);
  const period = jobType === "hourly" ? "hour" : jobType === "fixed" ? "fixed" : "unknown";
  return { min: valid[0] ?? null, max: valid[1] ?? valid[0] ?? null, period };
}

function engagementType(job: UpworkMcpJob): NormalizedOpportunity["engagementType"] {
  if (/full[_ -]?time/i.test(job.engagement ?? "")) return "full_time";
  if (job.job_type === "hourly" || job.job_type === "fixed") return "freelance";
  return inferEngagement(`${job.title}\n${job.description ?? job.description_snippet ?? ""}`).value;
}

/**
 * Maps a search row to the existing normalization contract without writing
 * to the database. Persistence is intentionally a later step because the
 * Upwork MCP/API terms and retention window must be confirmed first.
 */
export function mapUpworkMcpJob(input: unknown): NormalizedOpportunity {
  const job = upworkMcpJobSchema.parse(input);
  const description = cleanUntrustedMarkers(job.description ?? job.description_snippet ?? "");
  const fullText = `${job.title}\n${description}`;
  const budget = parseBudget(job.budget, job.job_type);
  const client = inferClientType(fullText);
  const language = detectLanguage(fullText);
  const sector = inferSector(fullText);
  const inferredEngagement = engagementType(job);
  const provenance: FieldProvenance = {
    title: { kind: "source" },
    description: { kind: "source", note: "Resultado de búsqueda MCP; puede ser sólo un snippet" },
    publishedAt: { kind: "source" },
    skills: { kind: "source", note: "Skills declaradas por Upwork + extracción conservadora del texto" },
    engagementType: { kind: "source", note: `Upwork job_type: ${job.job_type ?? "unknown"}` },
  };
  if (client.value !== "unknown") provenance.clientType = { kind: "inferred", note: client.evidence ?? undefined };
  if (language) provenance.language = { kind: "inferred" };
  if (sector) provenance.sector = { kind: "inferred" };
  if (job.experience_level) provenance.seniority = { kind: "source" };
  if (budget.min != null) {
    provenance.budget = {
      kind: "source",
      note: "El resultado MCP no expone un campo de moneda; se conserva el importe sin convertir ni asumir USD.",
    };
  }

  return {
    sourceKey: "upwork",
    // The persistence enum has no `mcp` member yet. Treating this as an
    // official API read is deliberate for the PoC; a DB migration can add a
    // distinct method once retention terms are approved.
    ingestionMethod: "api",
    externalId: job.id,
    originalUrl: normalizeUrl(job.url) ?? job.url,
    title: job.title,
    description,
    company: null,
    clientType: client.value,
    location: null,
    countries: [],
    remote: null,
    remoteModality: null,
    language,
    engagementType: inferredEngagement,
    budgetMin: budget.min,
    budgetMax: budget.max,
    budgetCurrency: null,
    budgetPeriod: budget.period,
    hoursPerWeek: null,
    durationText: job.duration ?? null,
    sector: sector ?? null,
    seniority: job.experience_level ?? null,
    skills: [...new Set([...job.skills, ...extractSkills(fullText)].map((skill) => skill.toLowerCase()))],
    competitorCount: null,
    publishedAt: parseDate(job.published_date ?? job.created_date),
    tags: [],
    confidence: "medium",
    provenance,
    isDemo: false,
    rawPayload: job,
  };
}
