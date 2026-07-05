import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { articles } from "~/server/db/schema";
import { articleCreateFromTextSchema, articleReExtractSchema } from "~/schemas/article";
import {
  createArticleFromText,
  createArticleFromUrl,
  deleteArticle,
  generateShareLink,
  getArticle,
  listArticles,
  reExtractArticle,
  updateArticle,
} from "~/server/services/articleService";

export const articleRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await listArticles(ctx.db, ctx.session.user.id, {
      isArchived: false,
    });
    return data;
  }),

  getArchived: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await listArticles(ctx.db, ctx.session.user.id, {
      isArchived: true,
    });
    return data;
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return getArticle(ctx.db, ctx.session.user.id, input.id);
    }),

  create: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
        folderId: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createArticleFromUrl(ctx.db, ctx.session.user.id, input);
    }),

  createFromText: protectedProcedure
    .input(articleCreateFromTextSchema)
    .mutation(async ({ ctx, input }) => {
      return createArticleFromText(ctx.db, ctx.session.user.id, input);
    }),

  reExtract: protectedProcedure
    .input(articleReExtractSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await reExtractArticle(
          ctx.db,
          ctx.session.user.id,
          input.articleId,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Re-extraction failed";
        throw new TRPCError({
          code: "BAD_REQUEST",
          message,
        });
      }
    }),

  updateMetadata: protectedProcedure
    .input(
      z
        .object({
          id: z.string(),
          title: z.string().min(1).optional(),
          url: z.string().url().optional(),
        })
        .refine((data) => Boolean(data.title ?? data.url), {
          message: "At least one field (title or url) must be provided",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await updateArticle(ctx.db, ctx.session.user.id, input.id, {
        title: input.title,
        url: input.url,
      });

      return {
        success: !!updated,
        article: updated,
      };
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await updateArticle(ctx.db, ctx.session.user.id, input.id, {
        isArchived: true,
      });
      return { success: !!updated };
    }),

  unarchive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await updateArticle(ctx.db, ctx.session.user.id, input.id, {
        isArchived: false,
      });
      return { success: !!updated };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const success = await deleteArticle(ctx.db, ctx.session.user.id, input.id);
      return { success };
    }),

  markAsRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await updateArticle(ctx.db, ctx.session.user.id, input.id, {
        isRead: true,
      });
      return { success: !!updated };
    }),

  /**
   * Generate or get existing share link for an article
   */
  generateShareLink: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const shareToken = await generateShareLink(
        ctx.db,
        ctx.session.user.id,
        input.id,
      );
      return { shareToken };
    }),

  /**
   * Get article by share token (public, no auth required)
   */
  getByShareToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.articles.findFirst({
        where: eq(articles.shareToken, input.token),
        columns: {
          id: true,
          url: true,
          title: true,
          content: true,
          excerpt: true,
          author: true,
          publishedAt: true,
          readingTime: true,
          wordCount: true,
          metadata: true,
          shareToken: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!row) return undefined;

      return {
        ...row,
        isFavorite: false,
        readAt: null,
        isRead: false,
        isArchived: false,
        folderId: null,
        tags: null,
      };
    }),
});
