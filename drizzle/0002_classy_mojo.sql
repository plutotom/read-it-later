ALTER TABLE "read-it-later_article" DROP CONSTRAINT "read-it-later_article_folderId_read-it-later_folder_id_fk";
--> statement-breakpoint
ALTER TABLE "read-it-later_folder" DROP CONSTRAINT "read-it-later_folder_parentId_read-it-later_folder_id_fk";
--> statement-breakpoint
ALTER TABLE "read-it-later_highlight" DROP CONSTRAINT "read-it-later_highlight_articleId_read-it-later_article_id_fk";
--> statement-breakpoint
ALTER TABLE "read-it-later_note" DROP CONSTRAINT "read-it-later_note_articleId_read-it-later_article_id_fk";
--> statement-breakpoint
ALTER TABLE "read-it-later_note" DROP CONSTRAINT "read-it-later_note_highlightId_read-it-later_highlight_id_fk";
--> statement-breakpoint
ALTER TABLE "read-it-later_article" ADD COLUMN "isFavorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "article_is_favorite_idx" ON "read-it-later_article" USING btree ("isFavorite");