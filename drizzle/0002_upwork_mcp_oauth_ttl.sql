CREATE TYPE "public"."upwork_connection_status" AS ENUM('connected', 'error', 'revoked');--> statement-breakpoint
ALTER TYPE "public"."ingestion_method" ADD VALUE 'mcp' BEFORE 'manual_form';--> statement-breakpoint
CREATE TABLE "upwork_connections" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"status" "upwork_connection_status" DEFAULT 'connected' NOT NULL,
	"access_token_ciphertext" text NOT NULL,
	"refresh_token_ciphertext" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"org_uid" text,
	"last_error" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "retention_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunity_source_records" ADD COLUMN "retention_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "opportunities_retention_idx" ON "opportunities" USING btree ("source_key","retention_expires_at");--> statement-breakpoint
CREATE INDEX "osr_retention_idx" ON "opportunity_source_records" USING btree ("source_key","retention_expires_at");