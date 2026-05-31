ALTER TABLE "read-it-later_para_export" ADD COLUMN IF NOT EXISTS "gotoPage" integer;--> statement-breakpoint
ALTER TABLE "read-it-later_para_export" ADD COLUMN IF NOT EXISTS "gotoVersion" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "read-it-later_para_export" ADD COLUMN IF NOT EXISTS "gotoSetAt" timestamp with time zone;
