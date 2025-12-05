CREATE TABLE "read-it-later_account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "read-it-later_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "read-it-later_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "read-it-later_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	CONSTRAINT "read-it-later_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "read-it-later_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "read-it-later_account" ADD CONSTRAINT "read-it-later_account_userId_read-it-later_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."read-it-later_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read-it-later_session" ADD CONSTRAINT "read-it-later_session_userId_read-it-later_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."read-it-later_user"("id") ON DELETE cascade ON UPDATE no action;