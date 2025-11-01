import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { articles } from "~/server/db/schema";
import { ArticleExtractor } from "~/server/services/articleExtractor";
import { articleCreateFromTextSchema } from "~/schemas/article";
import { JSDOM } from "jsdom";

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

  createFromText: publicProcedure
    .input(articleCreateFromTextSchema)
    .mutation(async ({ ctx, input }) => {
      // Generate placeholder URL for text articles
      const placeholderUrl = `text://manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Calculate word count and reading time from HTML content
      const dom = new JSDOM(input.content);
      const document = dom.window.document;
      const plainText = document.textContent || "";
      const wordCount = plainText
        .split(/\s+/)
        .filter((word) => word.length > 0).length;
      const readingTime = Math.ceil(wordCount / 200); // 200 words per minute

      // Extract excerpt from first paragraph
      const firstParagraph = document.querySelector("p");
      const excerpt =
        firstParagraph?.textContent?.trim() ||
        plainText.substring(0, 200).trim();

      const [newArticle] = await ctx.db
        .insert(articles)
        .values({
          url: placeholderUrl,
          title: input.title,
          content: input.content,
          excerpt: excerpt.length > 0 ? excerpt : null,
          author: input.author || null,
          publishedAt: input.publishedAt || null,
          wordCount: wordCount,
          readingTime: readingTime,
          folderId: input.folderId || null,
          tags: input.tags || null,
          metadata: {
            siteName: "Manual Entry",
            siteUrl: placeholderUrl,
            description: excerpt,
            language: "en",
            category: "Manual Entry",
          },
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

  markAsRead: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [updatedArticle] = await ctx.db
        .update(articles)
        .set({
          isRead: true,
          readAt: new Date(),
        })
        .where(eq(articles.id, input.id))
        .returning();

      return { success: !!updatedArticle };
    }),
});
