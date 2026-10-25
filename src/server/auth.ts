import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "~/server/db";
import { env } from "~/env";
import { nativeAuthOptions } from "./native-auth-options";
import { nextCookies } from "better-auth/next-js";

/**
 * Resolve the auth base URL so OAuth callbacks return to the CURRENT deployment.
 *
 * Preview deployments always use their own VERCEL_URL. Else prefer explicit
 * AUTH_URL, then VERCEL_URL, then the local development origin (:4114).
 * This prevents a shared production AUTH_URL from capturing preview callbacks.
 */
function resolveBaseURL(): string {
  // A legacy shared AUTH_URL must never bounce preview login into production.
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.AUTH_URL) {
    return env.AUTH_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return env.AUTH_URL;
}

const baseURL = resolveBaseURL();

/**
 * Trust only this deployment's known origins, not unrelated Vercel tenants.
 */
const trustedOrigins = Array.from(
  new Set([
    new URL(baseURL).origin,
    ...[process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
      .filter((host): host is string => Boolean(host))
      .map((host) => `https://${host}`),
  ]),
);
const nativeOptions = nativeAuthOptions();

export const auth = betterAuth({
  ...nativeOptions,
  plugins: [...nativeOptions.plugins, nextCookies()],
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
  socialProviders: {
    ...(/^\d{15,25}$/.test(env.DISCORD_CLIENT_ID)
      ? {
          discord: {
            clientId: env.DISCORD_CLIENT_ID,
            clientSecret: env.DISCORD_CLIENT_SECRET,
          },
        }
      : {}),
  },
  secret: env.AUTH_SECRET,
});

export type Session = typeof auth.$Infer.Session;
