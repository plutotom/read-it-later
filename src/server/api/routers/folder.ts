import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { folders } from "~/server/db/schema";

export const folderRouter = createTRPCRouter({
  getAll: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.folders.findMany({
      orderBy: (folders, { asc }) => [asc(folders.name)],
    });
  }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.folders.findFirst({
        where: eq(folders.id, input.id),
      });
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [newFolder] = await ctx.db
        .insert(folders)
        .values({
          name: input.name,
        })
        .returning();

      return newFolder;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(folders)
        .where(eq(folders.id, input.id))
        .returning();

      return { success: result.length > 0 };
    }),
});
