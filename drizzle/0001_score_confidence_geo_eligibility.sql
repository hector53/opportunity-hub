CREATE TYPE "public"."geo_eligibility" AS ENUM('eligible', 'ineligible', 'needs_review');--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "score_confidence" "confidence";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "geo_eligibility" "geo_eligibility";--> statement-breakpoint
CREATE INDEX "opportunities_eligibility_idx" ON "opportunities" USING btree ("geo_eligibility");