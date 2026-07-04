-- Kindle delivery log for Send to Kindle prototype
CREATE TABLE IF NOT EXISTS "read-it-later_kindle_delivery" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" text NOT NULL,
  "articleId" uuid,
  "kindleEmail" text NOT NULL,
  "senderEmail" text NOT NULL,
  "format" text DEFAULT 'html' NOT NULL,
  "filename" text NOT NULL,
  "bytes" integer NOT NULL,
  "contentHash" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "errorMessage" text,
  "externalId" text,
  "sentAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE "read-it-later_kindle_delivery" ADD CONSTRAINT "read-it-later_kindle_delivery_userId_read-it-later_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."read-it-later_user"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "read-it-later_kindle_delivery" ADD CONSTRAINT "read-it-later_kindle_delivery_articleId_read-it-later_article_id_fk" FOREIGN KEY ("articleId") REFERENCES "public"."read-it-later_article"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "kindle_delivery_user_idx" ON "read-it-later_kindle_delivery" USING btree ("userId");
CREATE INDEX IF NOT EXISTS "kindle_delivery_article_idx" ON "read-it-later_kindle_delivery" USING btree ("articleId");
CREATE INDEX IF NOT EXISTS "kindle_delivery_created_at_idx" ON "read-it-later_kindle_delivery" USING btree ("createdAt");
