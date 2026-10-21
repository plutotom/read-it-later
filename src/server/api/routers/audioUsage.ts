import { recoverExpiredJobs } from "~/server/services/audio-usage/ledger";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  audioReport,
  isAudioAdmin,
} from "~/server/services/audio-usage/reports";
import { month } from "~/server/services/audio-usage/metering";
export const audioUsageRouter = createTRPCRouter({
  recoverExpired: protectedProcedure.mutation(async ({ ctx }) => {
    if (!isAudioAdmin(ctx.session.user.id))
      throw new TRPCError({ code: "FORBIDDEN" });
    return { recovered: await recoverExpiredJobs() };
  }),
  summary: protectedProcedure
    .input(
      z
        .object({
          period: z
            .string()
            .regex(/^20\d{2}-(0[1-9]|1[0-2])$/)
            .optional(),
          scope: z.enum(["own", "all"]).default("own"),
          articleId: z.string().uuid().optional(),
        })
        .default({ scope: "own" }),
    )
    .query(async ({ ctx, input }) => {
      if (input.scope === "all" && !isAudioAdmin(ctx.session.user.id))
        throw new TRPCError({ code: "FORBIDDEN" });
      return audioReport(
        ctx.session.user.id,
        input.period ?? month(),
        input.scope === "all",
        input.articleId,
      );
    }),
});
