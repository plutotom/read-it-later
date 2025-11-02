ALTER TABLE "read-it-later_highlight" ADD COLUMN "contextPrefix" text;--> statement-breakpoint
ALTER TABLE "read-it-later_highlight" ADD COLUMN "contextSuffix" text;--> statement-breakpoint
ALTER TABLE "read-it-later_highlight" DROP COLUMN "quoteExact";--> statement-breakpoint
ALTER TABLE "read-it-later_highlight" DROP COLUMN "quotePrefix";--> statement-breakpoint
ALTER TABLE "read-it-later_highlight" DROP COLUMN "quoteSuffix";--> statement-breakpoint
ALTER TABLE "read-it-later_highlight" DROP COLUMN "contentHash";