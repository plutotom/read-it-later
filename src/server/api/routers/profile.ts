import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { and, eq } from "drizzle-orm";
import { users } from "@/server/db/schema";

export const profileRouter = createTRPCRouter({
  getMe: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const [profile] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    const [resume] = await ctx.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.role, "candidate")));
    return { profile, resume };
  }),
});
