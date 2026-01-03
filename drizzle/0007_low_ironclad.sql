CREATE TYPE "public"."theme" AS ENUM('light', 'dark');--> statement-breakpoint
CREATE TABLE "read-it-later_article_audio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"articleId" uuid NOT NULL,
	"audioUrl" text NOT NULL,
	"voiceName" text NOT NULL,
	"durationSeconds" real,
	"fileSizeBytes" integer,
	"currentTimeSeconds" real DEFAULT 0 NOT NULL,
	"lastPlayedAt" timestamp with time zone,
	"generatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "read-it-later_article_audio_articleId_unique" UNIQUE("articleId")
);
--> statement-breakpoint
CREATE TABLE "read-it-later_tts_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"billingPeriod" varchar(7) NOT NULL,
	"charactersUsed" integer DEFAULT 0 NOT NULL,
	"voiceType" varchar(50) DEFAULT 'standard' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "read-it-later_user_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"theme" "theme" DEFAULT 'light' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "read-it-later_user_preferences_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
ALTER TABLE "read-it-later_article" ADD COLUMN "shareToken" varchar(21);--> statement-breakpoint
ALTER TABLE "read-it-later_user" ADD COLUMN "deletedAt" timestamp;--> statement-breakpoint
ALTER TABLE "read-it-later_user_preferences" ADD CONSTRAINT "read-it-later_user_preferences_userId_read-it-later_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."read-it-later_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_audio_article_idx" ON "read-it-later_article_audio" USING btree ("articleId");--> statement-breakpoint
CREATE INDEX "article_share_token_idx" ON "read-it-later_article" USING btree ("shareToken");--> statement-breakpoint
ALTER TABLE "read-it-later_article" ADD CONSTRAINT "read-it-later_article_shareToken_unique" UNIQUE("shareToken");