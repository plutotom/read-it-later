import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  createParaExport,
  getParaArticleStatuses,
  getTotalParaBytes,
  listParaExports,
  removeParaExportByArticleId,
  removeParaExportById,
} from "~/server/services/paraExportService";

export const paraRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return listParaExports(ctx.db, ctx.session.user.id);
  }),

  getTotalBytes: protectedProcedure.query(async ({ ctx }) => {
    return getTotalParaBytes(ctx.db, ctx.session.user.id);
  }),

  getArticleStatuses: protectedProcedure
    .input(z.object({ articleIds: z.array(z.string().uuid()) }))
    .query(async ({ ctx, input }) => {
      return getParaArticleStatuses(
        ctx.db,
        ctx.session.user.id,
        input.articleIds,
      );
    }),

  isOnPara: protectedProcedure
    .input(z.object({ articleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const statuses = await getParaArticleStatuses(ctx.db, ctx.session.user.id, [
        input.articleId,
      ]);
      return statuses[input.articleId] ?? false;
    }),

  add: protectedProcedure
    .input(z.object({ articleId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const exportRow = await createParaExport(
          ctx.db,
          ctx.session.user.id,
          input.articleId,
        );
        return exportRow;
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Article not found",
        });
      }
    }),

  remove: protectedProcedure
    .input(
      z.object({
        exportId: z.string().uuid().optional(),
        articleId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.exportId && !input.articleId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Provide exportId or articleId",
        });
      }

      const success = input.exportId
        ? await removeParaExportById(
            ctx.db,
            ctx.session.user.id,
            input.exportId,
          )
        : await removeParaExportByArticleId(
            ctx.db,
            ctx.session.user.id,
            input.articleId!,
          );

      if (!success) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Export not found" });
      }

      return { success: true };
    }),
});
