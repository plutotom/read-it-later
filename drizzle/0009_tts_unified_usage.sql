-- Migrate tts_usage to unified standard-equivalent quota (one row per user per month)

ALTER TABLE "read-it-later_tts_usage" ADD COLUMN "rawCharactersUsed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- Aggregate existing per-voiceType rows into weighted totals per user/period
CREATE TEMP TABLE "tts_usage_merged" AS
SELECT
  MIN("id") AS "id",
  "userId",
  "billingPeriod",
  SUM(
    "charactersUsed" * CASE "voiceType"
      WHEN 'wavenet' THEN 4
      WHEN 'neural2' THEN 4
      WHEN 'studio' THEN 16
      ELSE 1
    END
  )::integer AS "charactersUsed",
  SUM("charactersUsed")::integer AS "rawCharactersUsed",
  MIN("createdAt") AS "createdAt",
  MAX("updatedAt") AS "updatedAt"
FROM "read-it-later_tts_usage"
GROUP BY "userId", "billingPeriod";--> statement-breakpoint

DELETE FROM "read-it-later_tts_usage";--> statement-breakpoint

INSERT INTO "read-it-later_tts_usage" (
  "id",
  "userId",
  "billingPeriod",
  "charactersUsed",
  "rawCharactersUsed",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "userId",
  "billingPeriod",
  "charactersUsed",
  "rawCharactersUsed",
  "createdAt",
  "updatedAt"
FROM "tts_usage_merged";--> statement-breakpoint

DROP TABLE "tts_usage_merged";--> statement-breakpoint

ALTER TABLE "read-it-later_tts_usage" DROP COLUMN "voiceType";--> statement-breakpoint

CREATE UNIQUE INDEX "tts_usage_user_period_idx" ON "read-it-later_tts_usage" USING btree ("userId","billingPeriod");
