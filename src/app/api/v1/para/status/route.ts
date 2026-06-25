import { z } from "zod";
import { RIL_READ_SCOPE } from "~/lib/paraConstants";
import { db } from "~/server/db";
import { ApiError, defineRoute } from "~/server/lib/apiHandler";
import { getParaArticleStatuses } from "~/server/services/paraExportService";

const articleIdsQuerySchema = z
  .string()
  .min(1)
  .transform((value) => value.split(",").map((id) => id.trim()))
  .pipe(z.array(z.string().uuid()).min(1).max(100));

export const GET = defineRoute(RIL_READ_SCOPE, async (ctx) => {
  const raw = ctx.searchParams.get("articleIds");
  if (!raw) {
    throw new ApiError(
      400,
      "invalid_request",
      "Provide `articleIds` as a comma-separated list of UUIDs",
    );
  }

  const parsed = articleIdsQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(400, "invalid_request", "Invalid `articleIds` query");
  }

  return getParaArticleStatuses(db, ctx.userId, parsed.data);
});
