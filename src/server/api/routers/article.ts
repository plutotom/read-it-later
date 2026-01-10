import { z } from "zod";
import { eq, and } from "drizzle-orm";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { articles } from "~/server/db/schema";
import { ArticleExtractor } from "~/server/services/articleExtractor";
import { articleCreateFromTextSchema } from "~/schemas/article";
import { JSDOM } from "jsdom";
import { nanoid } from "nanoid";

export const articleRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.articles.findMany({
      where: and(
        eq(articles.userId, ctx.session.user.id),
        eq(articles.isArchived, false),
      ),
      orderBy: (articles, { desc }) => [desc(articles.createdAt)],
    });
  }),

  getArchived: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.articles.findMany({
      where: and(
        eq(articles.userId, ctx.session.user.id),
        eq(articles.isArchived, true),
      ),
      orderBy: (articles, { desc }) => [desc(articles.createdAt)],
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.articles.findFirst({
        where: and(
          eq(articles.id, input.id),
          eq(articles.userId, ctx.session.user.id),
        ),
      });
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
      // Extract article content
      const extractedContent = await ArticleExtractor.extractFromUrl(input.url);

      const [newArticle] = await ctx.db
        .insert(articles)
        .values({
          userId: ctx.session.user.id,
          url: input.url,
          title: extractedContent.title,
          content: extractedContent.content,
          excerpt: extractedContent.excerpt ?? null,
          author: extractedContent.author ?? null,
          publishedAt: extractedContent.publishedAt ?? null,
          wordCount: extractedContent.wordCount ?? null,
          readingTime: extractedContent.readingTime ?? null,
          folderId: input.folderId ?? null,
          tags: input.tags ?? null,
          metadata: extractedContent.metadata ?? null,
        })
        .returning();

      return newArticle;
    }),

  createFromText: protectedProcedure
    .input(articleCreateFromTextSchema)
    .mutation(async ({ ctx, input }) => {
      // Generate placeholder URL for text articles when manual URL not provided
      const placeholderUrl = `text://manual-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const articleUrl = input.url ?? placeholderUrl;

      // Calculate word count and reading time from HTML content
      const dom = new JSDOM(input.content);
      const document = dom.window.document;
      const plainText = document.textContent ?? "";
      const wordCount = plainText
        .split(/\s+/)
        .filter((word) => word.length > 0).length;
      const readingTime = Math.ceil(wordCount / 200); // 200 words per minute

      // Extract excerpt from first paragraph
      const firstParagraph = document.querySelector("p");
      const excerpt =
        firstParagraph?.textContent?.trim() ??
        plainText.substring(0, 200).trim();

      const [newArticle] = await ctx.db
        .insert(articles)
        .values({
          userId: ctx.session.user.id,
          url: articleUrl,
          title: input.title,
          content: input.content,
          excerpt: excerpt.length > 0 ? excerpt : null,
          author: input.author ?? null,
          publishedAt: input.publishedAt ?? null,
          wordCount: wordCount,
          readingTime: readingTime,
          folderId: input.folderId ?? null,
          tags: input.tags ?? null,
          metadata: {
            siteName: "Manual Entry",
            siteUrl: articleUrl,
            description: excerpt,
            language: "en",
            category: "Manual Entry",
          },
        })
        .returning();

      return newArticle;
    }),

  updateMetadata: protectedProcedure
    .input(
      z
        .object({
          id: z.string(),
          title: z.string().min(1).optional(),
          url: z.string().url().optional(),
        })
        .refine((data) => data.title || data.url, {
          message: "At least one field (title or url) must be provided",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: Record<string, unknown> = {};
      if (input.title) updateData.title = input.title;
      if (input.url) updateData.url = input.url;

      const [updatedArticle] = await ctx.db
        .update(articles)
        .set(updateData)
        .where(
          and(
            eq(articles.id, input.id),
            eq(articles.userId, ctx.session.user.id),
          ),
        )
        .returning();

      return {
        success: !!updatedArticle,
        article: updatedArticle,
      };
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(articles)
        .set({ isArchived: true })
        .where(
          and(
            eq(articles.id, input.id),
            eq(articles.userId, ctx.session.user.id),
          ),
        )
        .returning();

      return { success: result.length > 0 };
    }),

  unarchive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .update(articles)
        .set({ isArchived: false })
        .where(
          and(
            eq(articles.id, input.id),
            eq(articles.userId, ctx.session.user.id),
          ),
        )
        .returning();

      return { success: result.length > 0 };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(articles)
        .where(
          and(
            eq(articles.id, input.id),
            eq(articles.userId, ctx.session.user.id),
          ),
        )
        .returning();

      return { success: result.length > 0 };
    }),

  markAsRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [updatedArticle] = await ctx.db
        .update(articles)
        .set({
          isRead: true,
          readAt: new Date(),
        })
        .where(
          and(
            eq(articles.id, input.id),
            eq(articles.userId, ctx.session.user.id),
          ),
        )
        .returning();

      return { success: !!updatedArticle };
    }),

  /**
   * Generate or get existing share link for an article
   */
  generateShareLink: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const article = await ctx.db.query.articles.findFirst({
        where: and(
          eq(articles.id, input.id),
          eq(articles.userId, ctx.session.user.id),
        ),
        columns: { id: true, shareToken: true },
      });

      if (!article) {
        throw new Error("Article not found");
      }

      // Return existing token if already shared
      if (article.shareToken) {
        return { shareToken: article.shareToken };
      }

      // Generate new token
      const token = nanoid();
      await ctx.db
        .update(articles)
        .set({ shareToken: token })
        .where(
          and(
            eq(articles.id, input.id),
            eq(articles.userId, ctx.session.user.id),
          ),
        );

      return { shareToken: token };
    }),

  /**
   * Get article by share token (public, no auth required)
   */
  getByShareToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.articles.findFirst({
        where: eq(articles.shareToken, input.token),
      });
    }),
});
