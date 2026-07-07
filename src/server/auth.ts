import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "~/server/db";
import { env } from "~/env";

/**
 * Resolve the auth base URL so OAuth callbacks return to the CURRENT deployment.
 *
 * Priority:
 *  1. AUTH_URL — explicit override (set this in production).
 *  2. VERCEL_URL — unique per Vercel *preview* deployment (no scheme, so we add https://).
 *  3. localhost — local dev fallback.
 *
 * Without this, a preview build would use the production/localhost AUTH_URL and the
 * Discord OAuth callback would bounce to the wrong host, breaking sign-in on previews.
 */
function resolveBaseURL(): string {
  if (env.AUTH_URL && env.AUTH_URL !== "http://localhost:3000") {
    return env.AUTH_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return env.AUTH_URL; // http://localhost:3000 default from env schema
}

const baseURL = resolveBaseURL();

/**
 * Origins Better Auth will accept requests from. Preview deployments live on
 * unique *.vercel.app subdomains, so we trust that wildcard in addition to the
 * resolved base URL. Add your production custom domain here explicitly.
 */
const trustedOrigins = [
  baseURL,
  "https://*.vercel.app",
  // "https://your-production-domain.com",
];

export const auth = betterAuth({
  baseURL,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  session: {
    // Keep users signed in longer and extend active sessions automatically.
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh every 24h of activity
  },
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    discord: {
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
    },
  },
  secret: env.AUTH_SECRET,
});

export type Session = typeof auth.$Infer.Session;
