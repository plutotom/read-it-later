ALTER TABLE "read-it-later_highlight" ADD COLUMN "quoteExact" text;--> statement-breakpoint
ALTER TABLE "read-it-later_highlight" ADD COLUMN "quotePrefix" text;--> statement-breakpoint
ALTER TABLE "read-it-later_highlight" ADD COLUMN "quoteSuffix" text;--> statement-breakpoint
ALTER TABLE "read-it-later_highlight" ADD COLUMN "contentHash" text;--> statement-breakpoint
ALTER TABLE "read-it-later_highlight" ADD COLUMN "tags" text[];--> statement-breakpoint
CREATE INDEX "highlight_article_created_idx" ON "read-it-later_highlight" USING btree ("articleId","createdAt");