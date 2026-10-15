CREATE TABLE "upwork_oauth_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_hash" text NOT NULL,
	"user_subject" text NOT NULL,
	"session_binding" text NOT NULL,
	"client_id" text NOT NULL,
	"code_verifier_ciphertext" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_calls" ADD COLUMN "opportunity_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "upwork_oauth_state_hash_uq" ON "upwork_oauth_transactions" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "upwork_oauth_expires_idx" ON "upwork_oauth_transactions" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;