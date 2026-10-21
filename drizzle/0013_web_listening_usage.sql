CREATE TABLE "read-it-later_listening_usage" (
  "userId" text NOT NULL,
  "window" varchar(32) NOT NULL,
  "characters" integer DEFAULT 0 NOT NULL,
  "requests" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "read-it-later_listening_usage_userId_read-it-later_user_id_fk" FOREIGN KEY ("userId") REFERENCES "read-it-later_user"("id") ON DELETE CASCADE,
  CONSTRAINT "read-it-later_listening_usage_userId_window_pk" PRIMARY KEY ("userId", "window")
);
