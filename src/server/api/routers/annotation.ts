import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { highlights, notes } from "~/server/db/schema";

export const annotationRouter = createTRPCRouter({
  // Highlights
  getHighlightsByArticleId: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.highlights.findMany({
        where: and(
          eq(highlights.articleId, input.articleId),
          eq(highlights.userId, ctx.session.user.id)
        ),
        orderBy: (highlights, { asc }) => [asc(highlights.startOffset)],
      });
    }),

  createHighlight: protectedProcedure
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
        contextPrefix: z.string().max(100).optional(),
        contextSuffix: z.string().max(100).optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [newHighlight] = await ctx.db
        .insert(highlights)
        .values({
          userId: ctx.session.user.id,
          articleId: input.articleId,
          text: input.text,
          startOffset: input.startOffset,
          endOffset: input.endOffset,
          color: input.color,
          note: input.note ?? null,
          contextPrefix: input.contextPrefix ?? null,
          contextSuffix: input.contextSuffix ?? null,
          tags: input.tags ?? [],
        })
        .returning();

      return newHighlight;
    }),

  updateHighlight: protectedProcedure
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
        .where(and(
          eq(highlights.id, id),
          eq(highlights.userId, ctx.session.user.id)
        ))
        .returning();

      if (!updatedHighlight) {
        throw new Error("Highlight not found");
      }

      return updatedHighlight;
    }),

  deleteHighlight: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(highlights)
        .where(and(
          eq(highlights.id, input.id),
          eq(highlights.userId, ctx.session.user.id)
        ))
        .returning();

      return { success: result.length > 0 };
    }),

  // Notes
  getNotesByArticleId: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.notes.findMany({
        where: and(
          eq(notes.articleId, input.articleId),
          eq(notes.userId, ctx.session.user.id)
        ),
        orderBy: (notes, { desc }) => [desc(notes.createdAt)],
      });
    }),

  createNote: protectedProcedure
    .input(
      z.object({
        articleId: z.string(),
        content: z.string(),
        highlightId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [newNote] = await ctx.db
        .insert(notes)
        .values({
          userId: ctx.session.user.id,
          articleId: input.articleId,
          content: input.content,
          highlightId: input.highlightId ?? null,
        })
        .returning();

      return newNote;
    }),

  updateNote: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        content: z.string().optional(),
        highlightId: z.string().uuid().nullable().optional(),
        position: z
          .object({
            x: z.number().min(0),
            y: z.number().min(0),
            page: z.number().int().min(1).optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;
      const [updatedNote] = await ctx.db
        .update(notes)
        .set({
          ...updateData,
          highlightId: updateData.highlightId ?? undefined,
        })
        .where(and(
          eq(notes.id, id),
          eq(notes.userId, ctx.session.user.id)
        ))
        .returning();

      if (!updatedNote) {
        throw new Error("Note not found");
      }

      return updatedNote;
    }),

  deleteNote: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(notes)
        .where(and(
          eq(notes.id, input.id),
          eq(notes.userId, ctx.session.user.id)
        ))
        .returning();

      return { success: result.length > 0 };
    }),
});
