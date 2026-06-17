import { RIL_READ_SCOPE } from "~/lib/paraConstants";
import { db } from "~/server/db";
import {
  ApiError,
  defineRoute,
  parseBoolParam,
  parsePagination,
} from "~/server/lib/apiHandler";
import { listArticles } from "~/server/services/articleService";

export const GET = defineRoute(RIL_READ_SCOPE, async (ctx) => {
  const q = ctx.searchParams.get("q");
  if (!q || q.trim().length === 0) {
    throw new ApiError(400, "invalid_query", "Query parameter `q` is required");
  }

  const { limit, cursor } = parsePagination(ctx.searchParams);
  return listArticles(db, ctx.userId, {
    q,
    limit,
    cursor,
    folderId: ctx.searchParams.get("folderId") ?? undefined,
    tag: ctx.searchParams.get("tag") ?? undefined,
    isArchived: parseBoolParam(ctx.searchParams, "isArchived"),
    isRead: parseBoolParam(ctx.searchParams, "isRead"),
    isFavorite: parseBoolParam(ctx.searchParams, "isFavorite"),
  });
});
