CREATE TYPE "public"."application_status" AS ENUM('saved', 'draft', 'applied', 'replied', 'interview', 'offer', 'hired', 'rejected', 'withdrawn', 'archived');--> statement-breakpoint
CREATE TYPE "public"."budget_period" AS ENUM('hour', 'month', 'year', 'fixed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."client_type" AS ENUM('founder', 'startup', 'smb', 'agency', 'recruiter', 'enterprise', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."engagement_type" AS ENUM('freelance', 'fractional', 'contract', 'part_time', 'full_time', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."ingestion_method" AS ENUM('api', 'manual_form', 'manual_text', 'email', 'demo');--> statement-breakpoint
CREATE TYPE "public"."message_classification" AS ENUM('invitation', 'client_reply', 'interview_request', 'rejection', 'offer', 'new_opportunity', 'other', 'unclassified');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('new', 'reviewing', 'saved', 'applied', 'discarded', 'archived');--> statement-breakpoint
CREATE TYPE "public"."proposal_origin" AS ENUM('template', 'ai', 'manual');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('draft', 'approved', 'sent_manually', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('none', 'low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."risk_severity" AS ENUM('info', 'warning', 'high');--> statement-breakpoint
CREATE TYPE "public"."risk_type" AS ENUM('external_repository', 'executable_test', 'unusual_links', 'crypto_wallet', 'credentials_request', 'payment_outside_platform', 'suspicious_communication', 'unpaid_assessment');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('connected', 'manual', 'email_based', 'pending_credentials', 'error', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'success', 'partial', 'error');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"action" text NOT NULL,
	"summary" text NOT NULL,
	"actor" text DEFAULT 'user' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"cache_key" text NOT NULL,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"ok" boolean NOT NULL,
	"response" jsonb,
	"error" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"cost_usd" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_status" "application_status",
	"to_status" "application_status",
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'saved' NOT NULL,
	"proposed_rate" numeric,
	"rate_currency" text DEFAULT 'USD',
	"rate_period" "budget_period" DEFAULT 'hour' NOT NULL,
	"language" text,
	"applied_at" timestamp with time zone,
	"next_follow_up_at" timestamp with time zone,
	"next_step" text,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"experiment_id" integer,
	"experiment_variant" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"website" text,
	"country" text,
	"client_type" "client_type" DEFAULT 'unknown' NOT NULL,
	"client_type_inferred" boolean DEFAULT true NOT NULL,
	"size_hint" text,
	"description" text,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"hypothesis" text,
	"variants" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"channel" text NOT NULL,
	"direction" text DEFAULT 'inbound' NOT NULL,
	"from_name" text,
	"from_address" text,
	"subject" text,
	"body" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"original_url" text,
	"external_thread_id" text,
	"is_partial" boolean DEFAULT true NOT NULL,
	"classification" "message_classification" DEFAULT 'unclassified' NOT NULL,
	"classification_inferred" boolean DEFAULT true NOT NULL,
	"application_id" uuid,
	"opportunity_id" uuid,
	"content_hash" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"ingestion_method" "ingestion_method" NOT NULL,
	"external_id" text,
	"original_url" text,
	"dedupe_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"possible_duplicate_of_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"company_id" uuid,
	"company_name" text,
	"client_type" "client_type" DEFAULT 'unknown' NOT NULL,
	"location" text,
	"countries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"remote" boolean,
	"remote_modality" text,
	"language" text,
	"engagement_type" "engagement_type" DEFAULT 'unknown' NOT NULL,
	"budget_min" numeric,
	"budget_max" numeric,
	"budget_currency" text,
	"budget_period" "budget_period" DEFAULT 'unknown' NOT NULL,
	"hours_per_week" integer,
	"duration_text" text,
	"sector" text,
	"seniority" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"competitor_count" integer,
	"published_at" timestamp with time zone,
	"status" "opportunity_status" DEFAULT 'new' NOT NULL,
	"discard_reason" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"confidence" "confidence" DEFAULT 'medium' NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"tech_fit" integer,
	"client_fit" integer,
	"commercial_fit" integer,
	"practical_fit" integer,
	"overall_score" integer,
	"risk_level" "risk_level" DEFAULT 'none' NOT NULL,
	"scored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"method" text NOT NULL,
	"version" text NOT NULL,
	"model" text,
	"tech_fit" integer,
	"client_fit" integer,
	"commercial_fit" integer,
	"practical_fit" integer,
	"overall" integer,
	"reasons" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_source_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"ingestion_method" "ingestion_method" NOT NULL,
	"external_id" text,
	"url" text,
	"payload_hash" text NOT NULL,
	"raw_payload" jsonb,
	"sync_run_id" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"application_id" uuid,
	"version" integer NOT NULL,
	"parent_id" uuid,
	"language" text NOT NULL,
	"style" text DEFAULT 'standard' NOT NULL,
	"content" text NOT NULL,
	"origin" "proposal_origin" NOT NULL,
	"model" text,
	"proposed_rate" numeric,
	"status" "proposal_status" DEFAULT 'draft' NOT NULL,
	"change_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" uuid,
	"message_id" uuid,
	"type" "risk_type" NOT NULL,
	"severity" "risk_severity" NOT NULL,
	"rule" text NOT NULL,
	"evidence" text NOT NULL,
	"detected_by" text DEFAULT 'rules' NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_presets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" "source_status" NOT NULL,
	"description" text,
	"homepage_url" text,
	"last_sync_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_error" text,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"trigger" text NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"fetched" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_source_key_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."sources"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_source_key_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."sources"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_scores" ADD CONSTRAINT "opportunity_scores_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_source_records" ADD CONSTRAINT "opportunity_source_records_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_source_records" ADD CONSTRAINT "opportunity_source_records_source_key_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."sources"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_source_records" ADD CONSTRAINT "opportunity_source_records_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_drafts" ADD CONSTRAINT "proposal_drafts_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_drafts" ADD CONSTRAINT "proposal_drafts_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_source_key_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."sources"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_created_idx" ON "activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_calls_cache_idx" ON "ai_calls" USING btree ("cache_key");--> statement-breakpoint
CREATE INDEX "ai_calls_created_idx" ON "ai_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "application_events_app_idx" ON "application_events" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_opportunity_uq" ON "applications" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "applications_followup_idx" ON "applications" USING btree ("next_follow_up_at");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_normalized_name_uq" ON "companies" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_content_hash_uq" ON "messages" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "messages_received_idx" ON "messages" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_dedupe_key_uq" ON "opportunities" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "opportunities_fingerprint_idx" ON "opportunities" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "opportunities_status_idx" ON "opportunities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "opportunities_source_idx" ON "opportunities" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "opportunities_published_idx" ON "opportunities" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "opportunities_score_idx" ON "opportunities" USING btree ("overall_score");--> statement-breakpoint
CREATE INDEX "scores_opportunity_idx" ON "opportunity_scores" USING btree ("opportunity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "osr_opportunity_payload_uq" ON "opportunity_source_records" USING btree ("opportunity_id","payload_hash");--> statement-breakpoint
CREATE INDEX "osr_external_idx" ON "opportunity_source_records" USING btree ("source_key","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_opportunity_version_uq" ON "proposal_drafts" USING btree ("opportunity_id","version");--> statement-breakpoint
CREATE INDEX "risk_flags_opportunity_idx" ON "risk_flags" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "risk_flags_message_idx" ON "risk_flags" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "sync_runs_source_idx" ON "sync_runs" USING btree ("source_key","started_at");