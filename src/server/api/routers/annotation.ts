import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { highlights, notes } from "~/server/db/schema";

export const annotationRouter = createTRPCRouter({
  // Highlights
  getHighlightsByArticleId: publicProcedure
    .input(z.object({ articleId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.highlights.findMany({
        where: eq(highlights.articleId, input.articleId),
        orderBy: (highlights, { asc }) => [asc(highlights.startOffset)],
      });
    }),

  createHighlight: publicProcedure
    .input(
      z.object({
        articleId: z.string(),
        text: z.string(),
        startOffset: z.number(),
        endOffset: z.number(),
        color: z
          .enum([
            "yellow",
            "green",
            "blue",
            "pink",
            "purple",
            "orange",
            "red",
            "gray",
          ])
          .default("yellow"),
        note: z.string().optional(),
        quoteExact: z.string().optional(),
        quotePrefix: z.string().optional(),
        quoteSuffix: z.string().optional(),
        contentHash: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [newHighlight] = await ctx.db
        .insert(highlights)
        .values({
          articleId: input.articleId,
          text: input.text,
          startOffset: input.startOffset,
          endOffset: input.endOffset,
          color: input.color,
          note: input.note || null,
          quoteExact: input.quoteExact || null,
          quotePrefix: input.quotePrefix || null,
          quoteSuffix: input.quoteSuffix || null,
          contentHash: input.contentHash || null,
          tags: input.tags || [],
        })
        .returning();

      return newHighlight;
    }),

  updateHighlight: publicProcedure
    .input(
      z.object({
        id: z.string(),
        color: z
          .enum([
            "yellow",
            "green",
            "blue",
            "pink",
            "purple",
            "orange",
            "red",
            "gray",
          ])
          .optional(),
        note: z.string().max(2000).optional().nullable(),
        tags: z.array(z.string().max(50)).max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;
      const [updatedHighlight] = await ctx.db
        .update(highlights)
        .set({
          ...updateData,
          note: updateData.note ?? undefined,
        })
        .where(eq(highlights.id, id))
        .returning();

      if (!updatedHighlight) {
        throw new Error("Highlight not found");
      }

      return updatedHighlight;
    }),

  deleteHighlight: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(highlights)
        .where(eq(highlights.id, input.id))
        .returning();

      return { success: result.length > 0 };
    }),

  // Notes
  getNotesByArticleId: publicProcedure
    .input(z.object({ articleId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.notes.findMany({
        where: eq(notes.articleId, input.articleId),
        orderBy: (notes, { desc }) => [desc(notes.createdAt)],
      });
    }),

  createNote: publicProcedure
    .input(
      z.object({
        articleId: z.string(),
        content: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [newNote] = await ctx.db
        .insert(notes)
        .values({
          articleId: input.articleId,
          content: input.content,
        })
        .returning();

      return newNote;
    }),

  deleteNote: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(notes)
        .where(eq(notes.id, input.id))
        .returning();

      return { success: result.length > 0 };
    }),
});
