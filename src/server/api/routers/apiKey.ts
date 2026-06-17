import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { apiKeys } from "~/server/db/schema";
import {
  generateApiKey,
  getApiKeyPrefix,
  hashApiKey,
} from "~/server/lib/apiKey";
import { READ_ONLY_SCOPES, READ_WRITE_SCOPES } from "~/lib/paraConstants";

export const apiKeyRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.apiKeys.findMany({
      where: eq(apiKeys.userId, ctx.session.user.id),
      orderBy: (keys, { desc }) => [desc(keys.createdAt)],
      columns: {
        id: true,
        label: true,
        keyPrefix: true,
        scopes: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        label: z.string().min(1).max(100),
        accessLevel: z.enum(["read", "readwrite"]).default("readwrite"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rawKey = generateApiKey();
      const scopes =
        input.accessLevel === "read"
          ? [...READ_ONLY_SCOPES]
          : [...READ_WRITE_SCOPES];

      const [created] = await ctx.db
        .insert(apiKeys)
        .values({
          userId: ctx.session.user.id,
          label: input.label.trim(),
          keyPrefix: getApiKeyPrefix(rawKey),
          keyHash: hashApiKey(rawKey),
          scopes,
        })
        .returning({
          id: apiKeys.id,
          label: apiKeys.label,
          keyPrefix: apiKeys.keyPrefix,
          createdAt: apiKeys.createdAt,
        });

      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create API key",
        });
      }

      return {
        ...created,
        key: rawKey,
      };
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [revoked] = await ctx.db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(apiKeys.id, input.id),
            eq(apiKeys.userId, ctx.session.user.id),
          ),
        )
        .returning({ id: apiKeys.id });

      if (!revoked) {
        throw new TRPCError({ code: "NOT_FOUND", message: "API key not found" });
      }

      return { success: true };
    }),
});
