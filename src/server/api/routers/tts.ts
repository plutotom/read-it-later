import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import {
  articleAudio,
  articles,
  ttsUsage,
  userPreferences,
} from "~/server/db/schema";
import { DEFAULT_VOICE, TTS_FREE_TIER_LIMIT } from "~/lib/tts-voices";
import {
  legacyAudio,
  recordLegacyReplay,
  deleteLegacyAudio,
} from "~/server/services/audio-usage/legacy";
import { month } from "~/server/services/audio-usage/metering";
import {
  isDocumentArticle,
  hasExtractedText,
  DOCUMENT_UNSUPPORTED_TTS_MESSAGE,
} from "~/lib/article-content-kind";

/**
 * Get the current billing period in YYYY-MM format
 */
function getCurrentBillingPeriod(): string {
  return month();
}

/**
 * Get user's preferred TTS voice name from their preferences
 */
async function getUserVoicePreference(
  db: typeof import("~/server/db").db,
  userId: string,
): Promise<string> {
  const prefs = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
    columns: { ttsVoiceName: true },
  });
  return prefs?.ttsVoiceName ?? process.env.TTS_VOICE_NAME ?? DEFAULT_VOICE;
}

type ArticleAudioPlaybackRow = Pick<
  typeof articleAudio.$inferSelect,
  | "audioUrl"
  | "durationSeconds"
  | "fileSizeBytes"
  | "voiceName"
  | "currentTimeSeconds"
  | "lastPlayedAt"
>;

function toArticleAudioPlaybackResponse(
  audio: ArticleAudioPlaybackRow,
  cached: boolean,
) {
  return {
    audioUrl: audio.audioUrl,
    durationSeconds: audio.durationSeconds,
    fileSizeBytes: audio.fileSizeBytes,
    voiceName: audio.voiceName,
    currentTimeSeconds: audio.currentTimeSeconds,
    lastPlayedAt: audio.lastPlayedAt,
    cached,
  };
}

function assertArticleSupportsTts(article: {
  content: string;
  metadata?: unknown;
}) {
  if (isDocumentArticle(article) && !hasExtractedText(article)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: DOCUMENT_UNSUPPORTED_TTS_MESSAGE,
    });
  }
}

export const ttsRouter = createTRPCRouter({
  /**
   * Get audio for an article
   * Generates audio if not cached, returns cached audio if available
   */
  getAudio: protectedProcedure
    .input(
      z.object({
        articleId: z.string().uuid(),
        voiceName: z.string().optional(), // Optional override for this generation
      }),
    )
    .query(async ({ ctx, input }) => {
      // Check for existing audio
      const existingAudio = await ctx.db.query.articleAudio.findFirst({
        where: and(
          eq(articleAudio.articleId, input.articleId),
          eq(articleAudio.userId, ctx.session.user.id),
        ),
      });

      if (existingAudio) {
        await recordLegacyReplay(ctx.session.user.id, input.articleId);
        return toArticleAudioPlaybackResponse(existingAudio, true);
      }

      // Fetch article content (ensure user owns it)
      const article = await ctx.db.query.articles.findFirst({
        where: and(
          eq(articles.id, input.articleId),
          eq(articles.userId, ctx.session.user.id),
        ),
      });

      if (!article) {
        throw new Error("Article not found");
      }

      assertArticleSupportsTts(article);

      // Get voice to use (override > user preference > env default)
      const voiceName =
        input.voiceName ??
        (await getUserVoicePreference(ctx.db, ctx.session.user.id));

      const { audio, cached } = await legacyAudio({
        userId: ctx.session.user.id,
        articleId: input.articleId,
        content: article.content,
        voice: voiceName,
        regenerate: false,
      });
      return toArticleAudioPlaybackResponse(audio, cached);
    }),

  /**
   * Check if audio exists without generating
   */
  getStatus: protectedProcedure
    .input(z.object({ articleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const audio = await ctx.db.query.articleAudio.findFirst({
        where: and(
          eq(articleAudio.articleId, input.articleId),
          eq(articleAudio.userId, ctx.session.user.id),
        ),
        columns: {
          id: true,
          audioUrl: true,
          durationSeconds: true,
          fileSizeBytes: true,
          voiceName: true,
          currentTimeSeconds: true,
          lastPlayedAt: true,
        },
      });

      return {
        hasAudio: !!audio,
        audio: audio ?? null,
      };
    }),

  /**
   * Force regenerate audio (e.g., after voice change)
   */
  regenerateAudio: protectedProcedure
    .input(
      z.object({
        articleId: z.string().uuid(),
        voiceName: z.string().optional(), // Optional override for this generation
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch article content (ensure user owns it)
      const article = await ctx.db.query.articles.findFirst({
        where: and(
          eq(articles.id, input.articleId),
          eq(articles.userId, ctx.session.user.id),
        ),
      });

      if (!article) {
        throw new Error("Article not found");
      }

      assertArticleSupportsTts(article);

      // Get voice to use (override > user preference > env default)
      const voiceName =
        input.voiceName ??
        (await getUserVoicePreference(ctx.db, ctx.session.user.id));

      const { audio, cached } = await legacyAudio({
        userId: ctx.session.user.id,
        articleId: input.articleId,
        content: article.content,
        voice: voiceName,
        regenerate: true,
      });
      return toArticleAudioPlaybackResponse(audio, cached);
    }),

  /**
   * Delete cached audio for an article
   */
  deleteAudio: protectedProcedure
    .input(z.object({ articleId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return deleteLegacyAudio(ctx.session.user.id, input.articleId);
    }),

  /**
   * Update playback progress
   */
  updateProgress: protectedProcedure
    .input(
      z.object({
        articleId: z.string().uuid(),
        currentTimeSeconds: z.number().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(articleAudio)
        .set({
          currentTimeSeconds: input.currentTimeSeconds,
          lastPlayedAt: new Date(),
        })
        .where(
          and(
            eq(articleAudio.articleId, input.articleId),
            eq(articleAudio.userId, ctx.session.user.id),
          ),
        )
        .returning();

      if (!updated) {
        throw new Error("No audio found for this article");
      }

      return { success: true, currentTimeSeconds: updated.currentTimeSeconds };
    }),

  /**
   * Get current voice configuration for the authenticated user
   */
  getVoiceConfig: protectedProcedure.query(async ({ ctx }) => {
    const voiceName = await getUserVoicePreference(ctx.db, ctx.session.user.id);
    return {
      voiceName,
      languageCode: process.env.TTS_VOICE_LANGUAGE ?? "en-US",
    };
  }),

  /**
   * Get TTS usage statistics for the current billing period (standard-equivalent quota)
   */
  getUsage: protectedProcedure.query(async ({ ctx }) => {
    const billingPeriod = getCurrentBillingPeriod();

    const usage = await ctx.db.query.ttsUsage.findFirst({
      where: and(
        eq(ttsUsage.userId, ctx.session.user.id),
        eq(ttsUsage.billingPeriod, billingPeriod),
      ),
    });

    const charactersUsed = usage?.charactersUsed ?? 0;
    const rawCharactersUsed = usage?.rawCharactersUsed ?? 0;
    const freeLimit = TTS_FREE_TIER_LIMIT;
    const charactersRemaining = Math.max(0, freeLimit - charactersUsed);
    const percentageUsed = Math.min(100, (charactersUsed / freeLimit) * 100);

    // Calculate the reset date (first day of next month)
    const now = new Date();
    const resetDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );

    return {
      billingPeriod,
      quotaModel: "standard-equivalent" as const,
      charactersUsed,
      rawCharactersUsed,
      charactersRemaining,
      freeLimit,
      percentageUsed,
      resetDate: resetDate.toISOString(),
    };
  }),

  /**
   * Get audio status for a shared article (public, by share token)
   */
  getStatusByShareToken: publicProcedure
    .input(z.object({ shareToken: z.string() }))
    .query(async ({ ctx, input }) => {
      // First find the article by share token
      const article = await ctx.db.query.articles.findFirst({
        where: eq(articles.shareToken, input.shareToken),
        columns: { id: true },
      });

      if (!article) {
        return { hasAudio: false, audio: null };
      }

      // Then get the audio for that article (any user's audio for shared view)
      const audio = await ctx.db.query.articleAudio.findFirst({
        where: eq(articleAudio.articleId, article.id),
        columns: {
          audioUrl: true,
          durationSeconds: true,
        },
      });

      return {
        hasAudio: !!audio,
        audio: audio ?? null,
      };
    }),
});
