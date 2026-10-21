CREATE TABLE "read-it-later_audio_job" (
 id text PRIMARY KEY, "userId" text REFERENCES "read-it-later_user"(id) ON DELETE SET NULL,
 "articleId" uuid REFERENCES "read-it-later_article"(id) ON DELETE SET NULL,
 environment text NOT NULL, path text NOT NULL, "allowanceUnits" integer NOT NULL DEFAULT 0, "allowancePeriod" text NOT NULL, state text NOT NULL, fence uuid NOT NULL,
 "leaseUntil" timestamptz NOT NULL, "cacheState" text NOT NULL DEFAULT 'pending',
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "read-it-later_audio_attempt" (
 id uuid PRIMARY KEY, "jobId" text NOT NULL REFERENCES "read-it-later_audio_job"(id),
 "userId" text REFERENCES "read-it-later_user"(id) ON DELETE SET NULL,
 environment text NOT NULL, "providerAccount" text NOT NULL, provider text NOT NULL,
 model text NOT NULL, voice text NOT NULL, "payloadHash" text NOT NULL, unit text NOT NULL,
 "requestedUnits" integer NOT NULL CHECK ("requestedUnits" >= 0), "reportedUnits" integer CHECK ("reportedUnits" >= 0),
 measurement text NOT NULL, state text NOT NULL DEFAULT 'dispatched', "rateVersion" text,
 "usdPerMillion" numeric(24,9), "estimatedUsd" numeric(30,15), "audioBytes" integer NOT NULL DEFAULT 0,
 "durationSeconds" real, "startedAt" timestamptz NOT NULL DEFAULT now(), "finishedAt" timestamptz
);
--> statement-breakpoint
CREATE INDEX audio_attempt_user_date_idx ON "read-it-later_audio_attempt" ("userId", "startedAt");
--> statement-breakpoint
CREATE INDEX audio_attempt_job_idx ON "read-it-later_audio_attempt" ("jobId");
--> statement-breakpoint
CREATE INDEX audio_attempt_date_idx ON "read-it-later_audio_attempt" ("startedAt");
--> statement-breakpoint
CREATE TABLE "read-it-later_audio_event" (
 id text PRIMARY KEY, "jobId" text NOT NULL REFERENCES "read-it-later_audio_job"(id),
 "attemptId" uuid REFERENCES "read-it-later_audio_attempt"(id), kind text NOT NULL, units integer,
 "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "read-it-later_audio_billing" (
 id text PRIMARY KEY, provider text NOT NULL, "providerAccount" text NOT NULL, environment text NOT NULL,
 period text NOT NULL, "invoiceMonth" text NOT NULL, sku text NOT NULL, model text NOT NULL, currency text NOT NULL,
 gross numeric(30,15) NOT NULL, credits numeric(30,15) NOT NULL, net numeric(30,15) NOT NULL,
 "importedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "read-it-later_audio_history" (
 id text PRIMARY KEY, "userId" text REFERENCES "read-it-later_user"(id) ON DELETE SET NULL,
 period text NOT NULL, source text NOT NULL, "admittedUnits" integer NOT NULL, "rawUnits" integer NOT NULL,
 "capturedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "read-it-later_audio_accounting_coverage" (id text PRIMARY KEY, "startedAt" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
INSERT INTO "read-it-later_audio_accounting_coverage" (id) VALUES ('detailed-v1');
--> statement-breakpoint
INSERT INTO "read-it-later_audio_history" (id,"userId",period,source,"admittedUnits","rawUnits")
 SELECT 'legacy:' || "userId" || ':' || "billingPeriod", "userId", "billingPeriod", 'legacy_weighted', "charactersUsed", "rawCharactersUsed" FROM "read-it-later_tts_usage";
--> statement-breakpoint
INSERT INTO "read-it-later_audio_history" (id,"userId",period,source,"admittedUnits","rawUnits")
 SELECT 'stream:' || "userId" || ':' || "window", "userId", substring("window" from 7), 'stream_admitted', characters, characters FROM "read-it-later_listening_usage" WHERE "window" LIKE 'month:%';
--> statement-breakpoint
CREATE TABLE "read-it-later_audio_cache_delivery" (
 id uuid PRIMARY KEY, "userId" text REFERENCES "read-it-later_user"(id) ON DELETE SET NULL,
 "articleId" uuid REFERENCES "read-it-later_article"(id) ON DELETE SET NULL,
 "artifactId" text NOT NULL, environment text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "read-it-later_audio_billing_import" (id text PRIMARY KEY, source text NOT NULL, snapshot jsonb NOT NULL, "importedAt" timestamptz NOT NULL DEFAULT now());

--> statement-breakpoint
CREATE TABLE "read-it-later_audio_reservation" (
 id uuid PRIMARY KEY,"jobId" text NOT NULL REFERENCES "read-it-later_audio_job"(id),
 "userId" text REFERENCES "read-it-later_user"(id) ON DELETE SET NULL, path text NOT NULL,
 period text NOT NULL,"admittedAt" timestamptz NOT NULL,"reservedUnits" integer NOT NULL,"rawUnits" integer NOT NULL,
 "dispatchedUnits" integer NOT NULL DEFAULT 0,"rawDispatched" integer NOT NULL DEFAULT 0,settled boolean NOT NULL DEFAULT false,
 CHECK ("dispatchedUnits" BETWEEN 0 AND "reservedUnits"),CHECK ("rawDispatched" BETWEEN 0 AND "rawUnits")
);
