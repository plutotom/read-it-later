CREATE TABLE "read-it-later_native_speech_cache" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "state" text NOT NULL,
  "fence" uuid NOT NULL,
  "leaseUntil" timestamp with time zone NOT NULL,
  "blobUrl" text,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "read-it-later_native_speech_orphan" (
  "url" text PRIMARY KEY NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
