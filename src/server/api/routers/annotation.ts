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
          .enum(["yellow", "green", "blue", "red", "purple"])
          .default("yellow"),
        note: z.string().optional(),
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
        })
        .returning();

      return newHighlight;
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
