import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  clearKindleEmail,
  getKindleArticleStatuses,
  getKindleSetup,
  KindleNotConfiguredError,
  listKindleDeliveries,
  retryKindleDelivery,
  saveKindleEmail,
  sendArticleToKindle,
  sendKindleTestDocument,
  UnsupportedKindleContentError,
} from "~/server/services/kindleDeliveryService";

export const kindleRouter = createTRPCRouter({
  getSetup: protectedProcedure.query(async ({ ctx }) => {
    return getKindleSetup(ctx.db, ctx.session.user.id);
  }),

  saveEmail: protectedProcedure
    .input(z.object({ kindleEmail: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await saveKindleEmail(
          ctx.db,
          ctx.session.user.id,
          input.kindleEmail,
        );
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Invalid Kindle email",
        });
      }
    }),

  clearEmail: protectedProcedure.mutation(async ({ ctx }) => {
    return clearKindleEmail(ctx.db, ctx.session.user.id);
  }),

  sendTest: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      return await sendKindleTestDocument(ctx.db, ctx.session.user.id);
    } catch (error) {
      if (error instanceof KindleNotConfiguredError) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: error.message,
        });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to send test email",
      });
    }
  }),

  send: protectedProcedure
    .input(
      z.object({
        articleId: z.string().uuid(),
        force: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await sendArticleToKindle(
          ctx.db,
          ctx.session.user.id,
          input.articleId,
          { force: input.force },
        );
      } catch (error) {
        if (error instanceof KindleNotConfiguredError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          });
        }
        if (error instanceof UnsupportedKindleContentError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to send to Kindle",
        });
      }
    }),

  getArticleStatuses: protectedProcedure
    .input(z.object({ articleIds: z.array(z.string().uuid()) }))
    .query(async ({ ctx, input }) => {
      return getKindleArticleStatuses(
        ctx.db,
        ctx.session.user.id,
        input.articleIds,
      );
    }),

  listDeliveries: protectedProcedure.query(async ({ ctx }) => {
    return listKindleDeliveries(ctx.db, ctx.session.user.id);
  }),

  retry: protectedProcedure
    .input(z.object({ deliveryId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await retryKindleDelivery(
          ctx.db,
          ctx.session.user.id,
          input.deliveryId,
        );
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Failed to retry delivery",
        });
      }
    }),
});
