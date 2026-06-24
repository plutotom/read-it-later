import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { HIGHLIGHT_COLORS } from "~/server/services/annotationService";
import {
  createHighlight,
  createNote,
  deleteHighlight,
  deleteNote,
  listHighlights,
  listNotes,
  updateHighlight,
  updateNote,
} from "~/server/services/annotationService";

const highlightColorSchema = z.enum(HIGHLIGHT_COLORS);

export const annotationRouter = createTRPCRouter({
  // Highlights
  getHighlightsByArticleId: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .query(async ({ ctx, input }) => {
      return listHighlights(ctx.db, ctx.session.user.id, input.articleId);
    }),

  createHighlight: protectedProcedure
    .input(
      z.object({
        articleId: z.string(),
        text: z.string(),
        startOffset: z.number(),
        endOffset: z.number(),
        color: highlightColorSchema.default("yellow"),
        contextPrefix: z.string().max(100),
        contextSuffix: z.string().max(100),
        version: z.number().int().optional(),
        anchorContentHash: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createHighlight(ctx.db, ctx.session.user.id, input);
    }),

  updateHighlight: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        color: highlightColorSchema.optional(),
        tags: z.array(z.string().max(50)).max(10).optional(),
        startOffset: z.number().int().min(0).optional(),
        endOffset: z.number().int().min(0).optional(),
        anchorContentHash: z.string().optional(),
        anchorStatus: z.enum(["anchored", "lost"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      const updated = await updateHighlight(
        ctx.db,
        ctx.session.user.id,
        id,
        patch,
      );
      if (!updated) {
        throw new Error("Highlight not found");
      }
      return updated;
    }),

  deleteHighlight: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const success = await deleteHighlight(
        ctx.db,
        ctx.session.user.id,
        input.id,
      );
      return { success };
    }),

  // Notes
  getNotesByArticleId: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .query(async ({ ctx, input }) => {
      return listNotes(ctx.db, ctx.session.user.id, input.articleId);
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
      return createNote(ctx.db, ctx.session.user.id, input);
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
      const { id, ...patch } = input;
      const updated = await updateNote(ctx.db, ctx.session.user.id, id, patch);
      if (!updated) {
        throw new Error("Note not found");
      }
      return updated;
    }),

  deleteNote: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const success = await deleteNote(ctx.db, ctx.session.user.id, input.id);
      return { success };
    }),
});
