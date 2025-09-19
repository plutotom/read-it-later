CREATE TYPE "public"."highlight_color" AS ENUM('yellow', 'green', 'blue', 'pink', 'purple', 'orange', 'red', 'gray');--> statement-breakpoint
CREATE TABLE "read-it-later_article" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"excerpt" text,
	"author" text,
	"publishedAt" timestamp with time zone,
	"readAt" timestamp with time zone,
	"isRead" boolean DEFAULT false NOT NULL,
	"isArchived" boolean DEFAULT false NOT NULL,
	"folderId" uuid,
	"wordCount" integer,
	"readingTime" integer,
	"tags" text[],
	"metadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "read-it-later_folder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"color" varchar(7),
	"icon" varchar(50),
	"parentId" uuid,
	"isDefault" boolean DEFAULT false NOT NULL,
	"articleCount" integer DEFAULT 0 NOT NULL,
	"userId" uuid,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "read-it-later_highlight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"articleId" uuid NOT NULL,
	"text" text NOT NULL,
	"startOffset" integer NOT NULL,
	"endOffset" integer NOT NULL,
	"color" "highlight_color" DEFAULT 'yellow' NOT NULL,
	"note" text,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "read-it-later_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"articleId" uuid NOT NULL,
	"highlightId" uuid,
	"content" text NOT NULL,
	"position" jsonb,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "read-it-later_article" ADD CONSTRAINT "read-it-later_article_folderId_read-it-later_folder_id_fk" FOREIGN KEY ("folderId") REFERENCES "public"."read-it-later_folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read-it-later_folder" ADD CONSTRAINT "read-it-later_folder_parentId_read-it-later_folder_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."read-it-later_folder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read-it-later_highlight" ADD CONSTRAINT "read-it-later_highlight_articleId_read-it-later_article_id_fk" FOREIGN KEY ("articleId") REFERENCES "public"."read-it-later_article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read-it-later_note" ADD CONSTRAINT "read-it-later_note_articleId_read-it-later_article_id_fk" FOREIGN KEY ("articleId") REFERENCES "public"."read-it-later_article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read-it-later_note" ADD CONSTRAINT "read-it-later_note_highlightId_read-it-later_highlight_id_fk" FOREIGN KEY ("highlightId") REFERENCES "public"."read-it-later_highlight"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_url_idx" ON "read-it-later_article" USING btree ("url");--> statement-breakpoint
CREATE INDEX "article_folder_idx" ON "read-it-later_article" USING btree ("folderId");--> statement-breakpoint
CREATE INDEX "article_created_at_idx" ON "read-it-later_article" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "article_is_read_idx" ON "read-it-later_article" USING btree ("isRead");--> statement-breakpoint
CREATE INDEX "article_is_archived_idx" ON "read-it-later_article" USING btree ("isArchived");--> statement-breakpoint
CREATE INDEX "article_tags_idx" ON "read-it-later_article" USING btree ("tags");--> statement-breakpoint
CREATE INDEX "folder_parent_idx" ON "read-it-later_folder" USING btree ("parentId");--> statement-breakpoint
CREATE INDEX "folder_name_idx" ON "read-it-later_folder" USING btree ("name");--> statement-breakpoint
CREATE INDEX "folder_is_default_idx" ON "read-it-later_folder" USING btree ("isDefault");--> statement-breakpoint
CREATE INDEX "highlight_article_idx" ON "read-it-later_highlight" USING btree ("articleId");--> statement-breakpoint
CREATE INDEX "highlight_created_at_idx" ON "read-it-later_highlight" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "note_article_idx" ON "read-it-later_note" USING btree ("articleId");--> statement-breakpoint
CREATE INDEX "note_highlight_idx" ON "read-it-later_note" USING btree ("highlightId");--> statement-breakpoint
CREATE INDEX "note_created_at_idx" ON "read-it-later_note" USING btree ("createdAt");