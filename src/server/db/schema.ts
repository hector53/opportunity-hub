import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AppSettings } from "@/features/settings/types";
import type { ScoreReasons } from "@/server/scoring/types";
import type { FieldProvenance } from "@/server/normalization/types";
import type { OpportunityFilters } from "@/features/opportunities/filters";

// ---------- Enums ----------

export const sourceStatusEnum = pgEnum("source_status", [
  "connected",
  "manual",
  "email_based",
  "pending_credentials",
  "error",
  "disabled",
]);

export const ingestionMethodEnum = pgEnum("ingestion_method", [
  "api",
  "manual_form",
  "manual_text",
  "email",
  "demo",
]);

export const clientTypeEnum = pgEnum("client_type", [
  "founder",
  "startup",
  "smb",
  "agency",
  "recruiter",
  "enterprise",
  "unknown",
]);

export const engagementTypeEnum = pgEnum("engagement_type", [
  "freelance",
  "fractional",
  "contract",
  "part_time",
  "full_time",
  "unknown",
]);

export const budgetPeriodEnum = pgEnum("budget_period", ["hour", "month", "year", "fixed", "unknown"]);

export const opportunityStatusEnum = pgEnum("opportunity_status", [
  "new",
  "reviewing",
  "saved",
  "applied",
  "discarded",
  "archived",
]);

export const confidenceEnum = pgEnum("confidence", ["high", "medium", "low"]);

export const riskTypeEnum = pgEnum("risk_type", [
  "external_repository",
  "executable_test",
  "unusual_links",
  "crypto_wallet",
  "credentials_request",
  "payment_outside_platform",
  "suspicious_communication",
  "unpaid_assessment",
]);

export const riskSeverityEnum = pgEnum("risk_severity", ["info", "warning", "high"]);
export const riskLevelEnum = pgEnum("risk_level", ["none", "low", "medium", "high"]);

export const applicationStatusEnum = pgEnum("application_status", [
  "saved",
  "draft",
  "applied",
  "replied",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
  "archived",
]);

export const proposalOriginEnum = pgEnum("proposal_origin", ["template", "ai", "manual"]);
export const proposalStatusEnum = pgEnum("proposal_status", ["draft", "approved", "sent_manually", "discarded"]);

export const messageClassificationEnum = pgEnum("message_classification", [
  "invitation",
  "client_reply",
  "interview_request",
  "rejection",
  "offer",
  "new_opportunity",
  "other",
  "unclassified",
]);

export const syncStatusEnum = pgEnum("sync_status", ["running", "success", "partial", "error"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------- Settings (single user for now) ----------

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").$type<AppSettings>().notNull(),
  ...timestamps,
});

// ---------- Sources ----------

export const sources = pgTable("sources", {
  key: text("key").primaryKey(), // getonboard | upwork | workana | email | manual
  name: text("name").notNull(),
  status: sourceStatusEnum("status").notNull(),
  description: text("description"),
  homepageUrl: text("homepage_url"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastError: text("last_error"),
  importedCount: integer("imported_count").notNull().default(0),
  ...timestamps,
});

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: serial("id").primaryKey(),
    sourceKey: text("source_key")
      .notNull()
      .references(() => sources.key),
    trigger: text("trigger").notNull(), // manual | schedule
    status: syncStatusEnum("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    fetched: integer("fetched").notNull().default(0),
    created: integer("created").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    errors: jsonb("errors").$type<string[]>().notNull().default([]),
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("sync_runs_source_idx").on(t.sourceKey, t.startedAt)],
);

// ---------- Companies ----------

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    website: text("website"),
    country: text("country"),
    clientType: clientTypeEnum("client_type").notNull().default("unknown"),
    clientTypeInferred: boolean("client_type_inferred").notNull().default(true),
    sizeHint: text("size_hint"),
    description: text("description"),
    notes: text("notes"),
    isDemo: boolean("is_demo").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("companies_normalized_name_uq").on(t.normalizedName)],
);

// ---------- Opportunities ----------

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceKey: text("source_key")
      .notNull()
      .references(() => sources.key),
    ingestionMethod: ingestionMethodEnum("ingestion_method").notNull(),
    externalId: text("external_id"),
    originalUrl: text("original_url"),
    dedupeKey: text("dedupe_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    possibleDuplicateOfId: uuid("possible_duplicate_of_id"),

    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    companyName: text("company_name"),
    clientType: clientTypeEnum("client_type").notNull().default("unknown"),
    location: text("location"),
    countries: jsonb("countries").$type<string[]>().notNull().default([]),
    remote: boolean("remote"),
    remoteModality: text("remote_modality"),
    language: text("language"), // es | en | pt | other | null
    engagementType: engagementTypeEnum("engagement_type").notNull().default("unknown"),
    budgetMin: numeric("budget_min", { mode: "number" }),
    budgetMax: numeric("budget_max", { mode: "number" }),
    budgetCurrency: text("budget_currency"),
    budgetPeriod: budgetPeriodEnum("budget_period").notNull().default("unknown"),
    hoursPerWeek: integer("hours_per_week"),
    durationText: text("duration_text"),
    sector: text("sector"),
    seniority: text("seniority"),
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    competitorCount: integer("competitor_count"),
    publishedAt: timestamp("published_at", { withTimezone: true }),

    status: opportunityStatusEnum("status").notNull().default("new"),
    discardReason: text("discard_reason"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    confidence: confidenceEnum("confidence").notNull().default("medium"),
    provenance: jsonb("provenance").$type<FieldProvenance>().notNull().default({}),
    isDemo: boolean("is_demo").notNull().default(false),

    // Denormalized latest scores (history lives in opportunity_scores)
    techFit: integer("tech_fit"),
    clientFit: integer("client_fit"),
    commercialFit: integer("commercial_fit"),
    practicalFit: integer("practical_fit"),
    overallScore: integer("overall_score"),
    riskLevel: riskLevelEnum("risk_level").notNull().default("none"),
    scoredAt: timestamp("scored_at", { withTimezone: true }),

    ...timestamps,
  },
  (t) => [
    uniqueIndex("opportunities_dedupe_key_uq").on(t.dedupeKey),
    index("opportunities_fingerprint_idx").on(t.fingerprint),
    index("opportunities_status_idx").on(t.status),
    index("opportunities_source_idx").on(t.sourceKey),
    index("opportunities_published_idx").on(t.publishedAt),
    index("opportunities_score_idx").on(t.overallScore),
  ],
);

export const opportunitySourceRecords = pgTable(
  "opportunity_source_records",
  {
    id: serial("id").primaryKey(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    sourceKey: text("source_key")
      .notNull()
      .references(() => sources.key),
    ingestionMethod: ingestionMethodEnum("ingestion_method").notNull(),
    externalId: text("external_id"),
    url: text("url"),
    payloadHash: text("payload_hash").notNull(),
    rawPayload: jsonb("raw_payload").$type<unknown>(),
    syncRunId: integer("sync_run_id").references(() => syncRuns.id, { onDelete: "set null" }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("osr_opportunity_payload_uq").on(t.opportunityId, t.payloadHash),
    index("osr_external_idx").on(t.sourceKey, t.externalId),
  ],
);

export const opportunityScores = pgTable(
  "opportunity_scores",
  {
    id: serial("id").primaryKey(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    method: text("method").notNull(), // deterministic | ai
    version: text("version").notNull(),
    model: text("model"),
    techFit: integer("tech_fit"),
    clientFit: integer("client_fit"),
    commercialFit: integer("commercial_fit"),
    practicalFit: integer("practical_fit"),
    overall: integer("overall"),
    reasons: jsonb("reasons").$type<ScoreReasons>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("scores_opportunity_idx").on(t.opportunityId, t.createdAt)],
);

export const riskFlags = pgTable(
  "risk_flags",
  {
    id: serial("id").primaryKey(),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }),
    type: riskTypeEnum("type").notNull(),
    severity: riskSeverityEnum("severity").notNull(),
    rule: text("rule").notNull(),
    evidence: text("evidence").notNull(),
    detectedBy: text("detected_by").notNull().default("rules"),
    dismissed: boolean("dismissed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("risk_flags_opportunity_idx").on(t.opportunityId), index("risk_flags_message_idx").on(t.messageId)],
);

// ---------- Saved filters ----------

export const searchPresets = pgTable("search_presets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  filters: jsonb("filters").$type<OpportunityFilters>().notNull(),
  ...timestamps,
});

// ---------- Experiments ----------

export const experiments = pgTable("experiments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  hypothesis: text("hypothesis"),
  variants: jsonb("variants").$type<string[]>().notNull(),
  active: boolean("active").notNull().default(true),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  ...timestamps,
});

// ---------- Applications ----------

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    status: applicationStatusEnum("status").notNull().default("saved"),
    proposedRate: numeric("proposed_rate", { mode: "number" }),
    rateCurrency: text("rate_currency").default("USD"),
    ratePeriod: budgetPeriodEnum("rate_period").notNull().default("hour"),
    language: text("language"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    nextStep: text("next_step"),
    links: jsonb("links").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    experimentId: integer("experiment_id").references(() => experiments.id, { onDelete: "set null" }),
    experimentVariant: text("experiment_variant"),
    isDemo: boolean("is_demo").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("applications_opportunity_uq").on(t.opportunityId),
    index("applications_status_idx").on(t.status),
    index("applications_followup_idx").on(t.nextFollowUpAt),
  ],
);

export const applicationEvents = pgTable(
  "application_events",
  {
    id: serial("id").primaryKey(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // status_change | comment | field_change
    fromStatus: applicationStatusEnum("from_status"),
    toStatus: applicationStatusEnum("to_status"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("application_events_app_idx").on(t.applicationId, t.createdAt)],
);

// ---------- Proposals ----------

export const proposalDrafts = pgTable(
  "proposal_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    version: integer("version").notNull(),
    parentId: uuid("parent_id"),
    language: text("language").notNull(),
    style: text("style").notNull().default("standard"), // brief | standard | detailed
    content: text("content").notNull(),
    origin: proposalOriginEnum("origin").notNull(),
    model: text("model"),
    proposedRate: numeric("proposed_rate", { mode: "number" }),
    status: proposalStatusEnum("status").notNull().default("draft"),
    changeNote: text("change_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("proposal_opportunity_version_uq").on(t.opportunityId, t.version)],
);

// ---------- Messages / notifications ----------

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceKey: text("source_key")
      .notNull()
      .references(() => sources.key),
    channel: text("channel").notNull(), // email | platform | manual
    direction: text("direction").notNull().default("inbound"),
    fromName: text("from_name"),
    fromAddress: text("from_address"),
    subject: text("subject"),
    body: text("body").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    originalUrl: text("original_url"),
    externalThreadId: text("external_thread_id"),
    isPartial: boolean("is_partial").notNull().default(true),
    classification: messageClassificationEnum("classification").notNull().default("unclassified"),
    classificationInferred: boolean("classification_inferred").notNull().default(true),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
    contentHash: text("content_hash").notNull(),
    read: boolean("read").notNull().default(false),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("messages_content_hash_uq").on(t.contentHash), index("messages_received_idx").on(t.receivedAt)],
);

// ---------- Activity log ----------

export const activityLog = pgTable(
  "activity_log",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    actor: text("actor").notNull().default("user"), // user | system
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_created_idx").on(t.createdAt)],
);

// ---------- AI call cache / usage ----------

export const aiCalls = pgTable(
  "ai_calls",
  {
    id: serial("id").primaryKey(),
    cacheKey: text("cache_key").notNull(),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    ok: boolean("ok").notNull(),
    response: jsonb("response").$type<unknown>(),
    error: text("error"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    costUsd: numeric("cost_usd", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_calls_cache_idx").on(t.cacheKey), index("ai_calls_created_idx").on(t.createdAt)],
);
