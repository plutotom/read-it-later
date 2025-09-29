import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { articles } from "~/server/db/schema";
import { ArticleExtractor } from "~/server/services/articleExtractor";

export const articleRouter = createTRPCRouter({
  getAll: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.articles.findMany({
      where: eq(articles.isArchived, false),
      orderBy: (articles, { desc }) => [desc(articles.createdAt)],
    });
  }),

  getArchived: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.articles.findMany({
      where: eq(articles.isArchived, true),
      orderBy: (articles, { desc }) => [desc(articles.createdAt)],
    });
  }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.articles.findFirst({
        where: eq(articles.id, input.id),
      });
    }),

  create: publicProcedure
    .input(
      z.object({
        url: z.string().url(),
        folderId: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Extract article content
      const extractedContent = await ArticleExtractor.extractFromUrl(input.url);

      const [newArticle] = await ctx.db
        .insert(articles)
        .values({
          url: input.url,
          title: extractedContent.title,
          content: extractedContent.content,
          excerpt: extractedContent.excerpt || null,
          author: extractedContent.author || null,
          publishedAt: extractedContent.publishedAt || null,
          wordCount: extractedContent.wordCount || null,
          readingTime: extractedContent.readingTime || null,
          folderId: input.folderId || null,
          tags: input.tags || null,
          metadata: extractedContent.metadata || null,
        })
        .returning();

      return newArticle;
    }),

  archive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(articles)
        .set({ isArchived: true })
        .where(eq(articles.id, input.id))
        .returning();

      return { success: result.length > 0 };
    }),

  unarchive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(articles)
        .set({ isArchived: false })
        .where(eq(articles.id, input.id))
        .returning();

      return { success: result.length > 0 };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(articles)
        .where(eq(articles.id, input.id))
        .returning();

      return { success: result.length > 0 };
    }),
});
