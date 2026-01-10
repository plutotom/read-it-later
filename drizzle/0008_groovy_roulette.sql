ALTER TABLE "read-it-later_folder" ALTER COLUMN "userId" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "read-it-later_folder" ALTER COLUMN "userId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "read-it-later_article_audio" ADD COLUMN "userId" text NOT NULL;--> statement-breakpoint
ALTER TABLE "read-it-later_article" ADD COLUMN "userId" text NOT NULL;--> statement-breakpoint
ALTER TABLE "read-it-later_highlight" ADD COLUMN "userId" text NOT NULL;--> statement-breakpoint
ALTER TABLE "read-it-later_note" ADD COLUMN "userId" text NOT NULL;--> statement-breakpoint
ALTER TABLE "read-it-later_tts_usage" ADD COLUMN "userId" text NOT NULL;--> statement-breakpoint
ALTER TABLE "read-it-later_user_preferences" ADD COLUMN "ttsVoiceName" varchar(100) DEFAULT 'en-US-Standard-A';--> statement-breakpoint
ALTER TABLE "read-it-later_article_audio" ADD CONSTRAINT "read-it-later_article_audio_userId_read-it-later_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."read-it-later_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read-it-later_article" ADD CONSTRAINT "read-it-later_article_userId_read-it-later_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."read-it-later_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read-it-later_folder" ADD CONSTRAINT "read-it-later_folder_userId_read-it-later_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."read-it-later_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read-it-later_highlight" ADD CONSTRAINT "read-it-later_highlight_userId_read-it-later_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."read-it-later_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read-it-later_note" ADD CONSTRAINT "read-it-later_note_userId_read-it-later_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."read-it-later_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read-it-later_tts_usage" ADD CONSTRAINT "read-it-later_tts_usage_userId_read-it-later_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."read-it-later_user"("id") ON DELETE cascade ON UPDATE no action;