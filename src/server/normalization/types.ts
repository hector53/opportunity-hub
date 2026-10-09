export type ProvenanceKind = "source" | "manual" | "inferred";

/** Per-field record of where a value came from. Missing key = not provided. */
export type FieldProvenance = Record<string, { kind: ProvenanceKind; note?: string }>;

export type ClientType = "founder" | "startup" | "smb" | "agency" | "recruiter" | "enterprise" | "unknown";
export type EngagementType = "freelance" | "fractional" | "contract" | "part_time" | "full_time" | "unknown";
export type BudgetPeriod = "hour" | "month" | "year" | "fixed" | "unknown";
export type IngestionMethod = "api" | "manual_form" | "manual_text" | "email" | "demo";

/** Shape every connector must produce before entering the ingestion pipeline. */
export interface NormalizedOpportunity {
  sourceKey: string;
  ingestionMethod: IngestionMethod;
  externalId: string | null;
  originalUrl: string | null;
  title: string;
  description: string;
  company: {
    name: string;
    website?: string | null;
    country?: string | null;
    description?: string | null;
  } | null;
  clientType: ClientType;
  location: string | null;
  countries: string[];
  remote: boolean | null;
  remoteModality: string | null;
  language: string | null;
  engagementType: EngagementType;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: string | null;
  budgetPeriod: BudgetPeriod;
  hoursPerWeek: number | null;
  durationText: string | null;
  sector: string | null;
  seniority: string | null;
  skills: string[];
  competitorCount: number | null;
  publishedAt: Date | null;
  tags: string[];
  confidence: "high" | "medium" | "low";
  provenance: FieldProvenance;
  isDemo: boolean;
  rawPayload: unknown;
}
