import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { articleAudio, articles } from "~/server/db/schema";
import { generateAudioForArticle, deleteAudioFromBlob } from "~/server/services/tts";

export const ttsRouter = createTRPCRouter({
  /**
   * Get audio for an article
   * Generates audio if not cached, returns cached audio if available
   */
  getAudio: publicProcedure
    .input(z.object({ articleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Check for existing audio
      const existingAudio = await ctx.db.query.articleAudio.findFirst({
        where: eq(articleAudio.articleId, input.articleId),
      });

      if (existingAudio) {
        return {
          audioUrl: existingAudio.audioUrl,
          durationSeconds: existingAudio.durationSeconds,
          fileSizeBytes: existingAudio.fileSizeBytes,
          voiceName: existingAudio.voiceName,
          currentTimeSeconds: existingAudio.currentTimeSeconds,
          lastPlayedAt: existingAudio.lastPlayedAt,
          cached: true,
        };
      }

      // Fetch article content
      const article = await ctx.db.query.articles.findFirst({
        where: eq(articles.id, input.articleId),
      });

      if (!article) {
        throw new Error("Article not found");
      }

      // Generate audio
      const result = await generateAudioForArticle(input.articleId, article.content);

      // Save to database
      const [newAudio] = await ctx.db
        .insert(articleAudio)
        .values({
          articleId: input.articleId,
          audioUrl: result.audioUrl,
          voiceName: result.voiceName,
          durationSeconds: result.durationSeconds,
          fileSizeBytes: result.fileSizeBytes,
          generatedAt: new Date(),
        })
        .returning();

      return {
        audioUrl: newAudio!.audioUrl,
        durationSeconds: newAudio!.durationSeconds,
        fileSizeBytes: newAudio!.fileSizeBytes,
        voiceName: newAudio!.voiceName,
        currentTimeSeconds: newAudio!.currentTimeSeconds,
        lastPlayedAt: newAudio!.lastPlayedAt,
        cached: false,
      };
    }),

  /**
   * Check if audio exists without generating
   */
  getStatus: publicProcedure
    .input(z.object({ articleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const audio = await ctx.db.query.articleAudio.findFirst({
        where: eq(articleAudio.articleId, input.articleId),
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
  regenerateAudio: publicProcedure
    .input(z.object({ articleId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check for existing audio and delete from blob storage
      const existingAudio = await ctx.db.query.articleAudio.findFirst({
        where: eq(articleAudio.articleId, input.articleId),
      });

      if (existingAudio) {
        // Delete from blob storage
        try {
          await deleteAudioFromBlob(existingAudio.audioUrl);
        } catch {
          // Ignore blob deletion errors (might already be deleted)
        }

        // Delete from database
        await ctx.db
          .delete(articleAudio)
          .where(eq(articleAudio.articleId, input.articleId));
      }

      // Fetch article content
      const article = await ctx.db.query.articles.findFirst({
        where: eq(articles.id, input.articleId),
      });

      if (!article) {
        throw new Error("Article not found");
      }

      // Generate new audio
      const result = await generateAudioForArticle(input.articleId, article.content);

      // Save to database
      const [newAudio] = await ctx.db
        .insert(articleAudio)
        .values({
          articleId: input.articleId,
          audioUrl: result.audioUrl,
          voiceName: result.voiceName,
          durationSeconds: result.durationSeconds,
          fileSizeBytes: result.fileSizeBytes,
          generatedAt: new Date(),
        })
        .returning();

      return {
        audioUrl: newAudio!.audioUrl,
        durationSeconds: newAudio!.durationSeconds,
        fileSizeBytes: newAudio!.fileSizeBytes,
        voiceName: newAudio!.voiceName,
      };
    }),

  /**
   * Delete cached audio for an article
   */
  deleteAudio: publicProcedure
    .input(z.object({ articleId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existingAudio = await ctx.db.query.articleAudio.findFirst({
        where: eq(articleAudio.articleId, input.articleId),
      });

      if (!existingAudio) {
        return { success: true, deleted: false };
      }

      // Delete from blob storage
      try {
        await deleteAudioFromBlob(existingAudio.audioUrl);
      } catch {
        // Ignore blob deletion errors
      }

      // Delete from database
      await ctx.db
        .delete(articleAudio)
        .where(eq(articleAudio.articleId, input.articleId));

      return { success: true, deleted: true };
    }),

  /**
   * Update playback progress
   */
  updateProgress: publicProcedure
    .input(
      z.object({
        articleId: z.string().uuid(),
        currentTimeSeconds: z.number().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(articleAudio)
        .set({
          currentTimeSeconds: input.currentTimeSeconds,
          lastPlayedAt: new Date(),
        })
        .where(eq(articleAudio.articleId, input.articleId))
        .returning();

      if (!updated) {
        throw new Error("No audio found for this article");
      }

      return { success: true, currentTimeSeconds: updated.currentTimeSeconds };
    }),

  /**
   * Get current voice configuration
   */
  getVoiceConfig: publicProcedure.query(() => {
    return {
      voiceName: process.env.TTS_VOICE_NAME ?? "en-US-Standard-A",
      languageCode: process.env.TTS_VOICE_LANGUAGE ?? "en-US",
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

      // Then get the audio for that article
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
