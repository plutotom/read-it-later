import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  createFolder,
  deleteFolder,
  getFolder,
  listFolders,
} from "~/server/services/folderService";

export const folderRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return listFolders(ctx.db, ctx.session.user.id);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return getFolder(ctx.db, ctx.session.user.id, input.id);
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createFolder(ctx.db, ctx.session.user.id, { name: input.name });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const success = await deleteFolder(ctx.db, ctx.session.user.id, input.id);
      return { success };
    }),
});
