import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    AUTH_SECRET: z.string().min(1).default("dev-secret-change-me"),
    AUTH_URL: z.string().url().default("http://localhost:3000"),
    DISCORD_CLIENT_ID: z
      .string()
      .min(1)
      .default("placeholder-discord-client-id"),
    DISCORD_CLIENT_SECRET: z
      .string()
      .min(1)
      .default("placeholder-discord-client-secret"),
    BETTER_AUTH_SECRET: z.string().min(1).default("dev-secret-change-me"),
    AUDIO_USAGE_ADMIN_IDS: z.string().optional(),
    // JSON rate cards for non-default contracts; server-owned, never accepted from clients.
    AUDIO_USAGE_RATE_CARDS: z.string().optional(),
    AUDIO_USAGE_PROVIDER_ACCOUNT: z.string().default("default"),
    // Google Cloud TTS
    GOOGLE_CLOUD_TTS_CREDENTIALS: z.string().optional(),
    TTS_VOICE_NAME: z.string().default("en-US-Chirp3-HD-Charon"),
    TTS_VOICE_LANGUAGE: z.string().default("en-US"),
    // Authenticated web listening is rolled out independently of the iOS prototype.
    WEB_SPEECH_ENABLED: z.enum(["true", "false"]).default("false"),
    WEB_SPEECH_MONTHLY_CHARACTER_LIMIT: z.coerce
      .number()
      .int()
      .min(1000)
      .max(10_000_000)
      .default(500_000),
    // Native speech is disabled unless a private test deployment explicitly opts in.
    NATIVE_SPEECH_ENABLED: z.enum(["true", "false"]).default("false"),
    // The enabled prototype remains unauthenticated until accounts land.
    SPEECHIFY_API_KEY: z.string().optional(),
    INWORLD_API_KEY: z.string().optional(),
    NATIVE_SPEECH_PROVIDER: z
      .enum(["speechify", "inworld"])
      .default("speechify"),
    NATIVE_SPEECH_DATABASE_URL: z.string().url().optional(),
    NATIVE_SPEECH_BLOB_TOKEN: z.string().optional(),
    NATIVE_SPEECH_BLOB_STORE_ID: z.string().optional(),
    // Vercel Blob
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_AUTH_URL: z.string().url().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: process.env.AUTH_URL,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
    NEXT_PUBLIC_AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    AUDIO_USAGE_ADMIN_IDS: process.env.AUDIO_USAGE_ADMIN_IDS,
    AUDIO_USAGE_RATE_CARDS: process.env.AUDIO_USAGE_RATE_CARDS,
    AUDIO_USAGE_PROVIDER_ACCOUNT: process.env.AUDIO_USAGE_PROVIDER_ACCOUNT,
    // Google Cloud TTS
    GOOGLE_CLOUD_TTS_CREDENTIALS: process.env.GOOGLE_CLOUD_TTS_CREDENTIALS,
    TTS_VOICE_NAME: process.env.TTS_VOICE_NAME,
    TTS_VOICE_LANGUAGE: process.env.TTS_VOICE_LANGUAGE,
    WEB_SPEECH_ENABLED: process.env.WEB_SPEECH_ENABLED,
    WEB_SPEECH_MONTHLY_CHARACTER_LIMIT:
      process.env.WEB_SPEECH_MONTHLY_CHARACTER_LIMIT,
    NATIVE_SPEECH_ENABLED: process.env.NATIVE_SPEECH_ENABLED,
    SPEECHIFY_API_KEY: process.env.SPEECHIFY_API_KEY,
    INWORLD_API_KEY: process.env.INWORLD_API_KEY,
    NATIVE_SPEECH_PROVIDER: process.env.NATIVE_SPEECH_PROVIDER,
    NATIVE_SPEECH_DATABASE_URL: process.env.NATIVE_SPEECH_DATABASE_URL,
    NATIVE_SPEECH_BLOB_TOKEN: process.env.NATIVE_SPEECH_BLOB_TOKEN,
    NATIVE_SPEECH_BLOB_STORE_ID: process.env.NATIVE_SPEECH_BLOB_STORE_ID,
    // Vercel Blob
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
