import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { folders } from "~/server/db/schema";

export const folderRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.folders.findMany({
      where: eq(folders.userId, ctx.session.user.id),
      orderBy: (folders, { asc }) => [asc(folders.name)],
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.folders.findFirst({
        where: and(
          eq(folders.id, input.id),
          eq(folders.userId, ctx.session.user.id)
        ),
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [newFolder] = await ctx.db
        .insert(folders)
        .values({
          userId: ctx.session.user.id,
          name: input.name,
        })
        .returning();

      return newFolder;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(folders)
        .where(and(
          eq(folders.id, input.id),
          eq(folders.userId, ctx.session.user.id)
        ))
        .returning();

      return { success: result.length > 0 };
    }),
});
