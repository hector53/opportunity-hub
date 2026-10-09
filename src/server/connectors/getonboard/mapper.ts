import { z } from "zod";
import {
  detectLanguage,
  extractSkills,
  htmlToText,
  inferClientType,
  inferHoursPerWeek,
  inferSector,
} from "@/server/normalization/text";
import type { EngagementType, FieldProvenance, NormalizedOpportunity } from "@/server/normalization/types";

/**
 * Schema of the public Get on Board API v0 (`/api/v0/search/jobs` with
 * `expand=["company","tags","modality","seniority"]`), verified against live responses
 * on 2026-10-09. Fields are permissive: unknown/new fields are ignored, missing ones become null.
 */
const relation = <T extends z.ZodTypeAny>(attrs: T) =>
  z
    .object({
      data: z
        .object({ id: z.union([z.string(), z.number()]), type: z.string(), attributes: attrs.optional() })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional();

export const gobJobSchema = z.object({
  id: z.string(),
  type: z.literal("job"),
  attributes: z.object({
    title: z.string(),
    description: z.string().nullable().optional(),
    projects: z.string().nullable().optional(),
    functions: z.string().nullable().optional(),
    benefits: z.string().nullable().optional(),
    desirable: z.string().nullable().optional(),
    remote: z.boolean().nullable().optional(),
    remote_modality: z.string().nullable().optional(),
    remote_zone: z.unknown().optional(),
    countries: z.array(z.string()).nullable().optional(),
    lang: z.string().nullable().optional(),
    category_name: z.string().nullable().optional(),
    min_salary: z.number().nullable().optional(),
    max_salary: z.number().nullable().optional(),
    published_at: z.number().nullable().optional(),
    applications_count: z.number().nullable().optional(),
    modality: relation(z.object({ name: z.string().optional(), locale_key: z.string().optional() })),
    seniority: relation(z.object({ name: z.string().optional(), locale_key: z.string().optional() })),
    tags: z
      .object({
        data: z.array(z.object({ id: z.union([z.string(), z.number()]), attributes: z.object({ name: z.string() }).optional() })),
      })
      .nullable()
      .optional(),
    company: relation(
      z.object({
        name: z.string(),
        description: z.string().nullable().optional(),
        web: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
      }),
    ),
  }),
  links: z.object({ public_url: z.string().url() }).optional(),
});

export const gobSearchResponseSchema = z.object({
  data: z.array(z.unknown()),
  meta: z.object({ page: z.number(), per_page: z.number(), total_pages: z.number() }).optional(),
});

export type GobJob = z.infer<typeof gobJobSchema>;

const MODALITY_MAP: Record<string, EngagementType> = {
  full_time: "full_time",
  part_time: "part_time",
  freelance: "freelance",
};

export function mapGobJob(job: GobJob): NormalizedOpportunity {
  const a = job.attributes;
  const sections: [string, string | null | undefined][] = [
    ["", a.description],
    ["Funciones", a.functions],
    ["Proyecto", a.projects],
    ["Deseable", a.desirable],
    ["Beneficios / condiciones", a.benefits],
  ];
  const description = sections
    .map(([h, html]) => {
      const t = htmlToText(html);
      return t ? (h ? `## ${h}\n${t}` : t) : "";
    })
    .filter(Boolean)
    .join("\n\n");

  const provenance: FieldProvenance = {
    title: { kind: "source" },
    description: { kind: "source" },
    publishedAt: { kind: "source" },
  };

  const company = a.company?.data?.attributes
    ? {
        name: a.company.data.attributes.name,
        website: a.company.data.attributes.web ?? null,
        country: a.company.data.attributes.country ?? null,
        description: htmlToText(a.company.data.attributes.description) || null,
      }
    : null;
  if (company) provenance.company = { kind: "source" };

  const modalityKey = a.modality?.data?.attributes?.locale_key ?? "";
  let engagementType: EngagementType = MODALITY_MAP[modalityKey] ?? "unknown";
  if (engagementType !== "unknown") provenance.engagementType = { kind: "source", note: `Get on Board modality: ${modalityKey}` };
  if (/contractor/i.test(description) && engagementType === "full_time") {
    engagementType = "contract";
    provenance.engagementType = { kind: "inferred", note: "Full time marcado como contractor en la descripción" };
  }

  const fullText = `${a.title}\n${description}\n${company?.description ?? ""}`;
  const client = inferClientType(`${a.title}\n${description}`, `${company?.name ?? ""}\n${company?.description ?? ""}`);
  if (client.value !== "unknown") provenance.clientType = { kind: "inferred", note: `Texto: "${client.evidence}"` };

  const tagNames = (a.tags?.data ?? []).map((t) => t.attributes?.name).filter((n): n is string => !!n);
  const skills = [...new Set([...tagNames.map((t) => t.toLowerCase()), ...extractSkills(fullText)])];
  if (tagNames.length) provenance.skills = { kind: "source", note: "Tags de Get on Board + extracción de texto" };

  const hasSalary = a.min_salary != null || a.max_salary != null;
  if (hasSalary)
    provenance.budget = {
      kind: "source",
      note: "Get on Board publica rangos salariales mensuales en USD (convención de la plataforma; verificar en la oferta)",
    };

  const language = a.lang ?? detectLanguage(fullText);
  provenance.language = a.lang ? { kind: "source" } : { kind: "inferred" };

  const sector = inferSector(fullText);
  if (sector) provenance.sector = { kind: "inferred" };

  const hours = inferHoursPerWeek(fullText);
  if (hours) provenance.hoursPerWeek = { kind: "inferred" };

  if (a.applications_count != null) provenance.competitorCount = { kind: "source", note: "applications_count de Get on Board" };

  return {
    sourceKey: "getonboard",
    ingestionMethod: "api",
    externalId: job.id,
    originalUrl: job.links?.public_url ?? `https://www.getonbrd.com/jobs/${job.id}`,
    title: a.title.trim(),
    description,
    company,
    clientType: client.value,
    location: a.countries?.join(", ") || null,
    countries: a.countries ?? [],
    remote: a.remote ?? null,
    remoteModality: a.remote_modality ?? null,
    language,
    engagementType,
    budgetMin: a.min_salary ?? null,
    budgetMax: a.max_salary ?? null,
    budgetCurrency: hasSalary ? "USD" : null,
    budgetPeriod: hasSalary ? "month" : "unknown",
    hoursPerWeek: hours,
    durationText: null,
    sector: sector ?? (a.category_name ? a.category_name.toLowerCase() : null),
    seniority: a.seniority?.data?.attributes?.name ?? null,
    skills,
    competitorCount: a.applications_count ?? null,
    publishedAt: a.published_at ? new Date(a.published_at * 1000) : null,
    tags: [],
    confidence: "high",
    provenance,
    isDemo: false,
    rawPayload: job,
  };
}
