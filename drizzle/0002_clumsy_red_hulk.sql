CREATE TABLE "jess-app_account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "jess-app_account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "jess-app_session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jess-app_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp DEFAULT now(),
	"image" text,
	"role" text DEFAULT 'candidate' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jess-app_verification_token" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "jess-app_verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "jess-app_account" ADD CONSTRAINT "jess-app_account_userId_jess-app_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."jess-app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jess-app_session" ADD CONSTRAINT "jess-app_session_userId_jess-app_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."jess-app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "jess-app_session" USING btree ("userId");