CREATE TABLE "read-it-later_api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"label" text NOT NULL,
	"keyPrefix" text NOT NULL,
	"keyHash" text NOT NULL,
	"scopes" text[] DEFAULT '{"para:read"}' NOT NULL,
	"lastUsedAt" timestamp with time zone,
	"revokedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "read-it-later_para_export" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"articleId" uuid,
	"title" text NOT NULL,
	"filename" text NOT NULL,
	"txtContent" text NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"contentHash" text NOT NULL,
	"gotoPage" integer,
	"gotoVersion" integer DEFAULT 0 NOT NULL,
	"gotoSetAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "read-it-later_tts_usage" ADD COLUMN "rawCharactersUsed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "read-it-later_api_key" ADD CONSTRAINT "read-it-later_api_key_userId_read-it-later_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."read-it-later_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read-it-later_para_export" ADD CONSTRAINT "read-it-later_para_export_userId_read-it-later_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."read-it-later_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read-it-later_para_export" ADD CONSTRAINT "read-it-later_para_export_articleId_read-it-later_article_id_fk" FOREIGN KEY ("articleId") REFERENCES "public"."read-it-later_article"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_key_user_idx" ON "read-it-later_api_key" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "api_key_hash_idx" ON "read-it-later_api_key" USING btree ("keyHash");--> statement-breakpoint
CREATE INDEX "para_export_user_idx" ON "read-it-later_para_export" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "para_export_article_idx" ON "read-it-later_para_export" USING btree ("articleId");--> statement-breakpoint
CREATE INDEX "para_export_created_at_idx" ON "read-it-later_para_export" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "tts_usage_user_period_idx" ON "read-it-later_tts_usage" USING btree ("userId","billingPeriod");--> statement-breakpoint
ALTER TABLE "read-it-later_tts_usage" DROP COLUMN "voiceType";