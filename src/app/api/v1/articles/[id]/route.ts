import { RIL_READ_SCOPE, RIL_WRITE_SCOPE } from "~/lib/paraConstants";
import { db } from "~/server/db";
import {
  ApiError,
  defineRoute,
  noContent,
  parseBody,
} from "~/server/lib/apiHandler";
import {
  deleteArticle,
  getArticle,
  updateArticle,
} from "~/server/services/articleService";
import { articleUpdateApiSchema } from "~/schemas/apiV1";

export const GET = defineRoute(RIL_READ_SCOPE, async (ctx) => {
  const article = await getArticle(db, ctx.userId, ctx.param("id"));
  if (!article) throw new ApiError(404, "not_found", "Article not found");
  return article;
});

export const PATCH = defineRoute(RIL_WRITE_SCOPE, async (ctx) => {
  const patch = await parseBody(ctx, articleUpdateApiSchema);
  const updated = await updateArticle(db, ctx.userId, ctx.param("id"), patch);
  if (!updated) throw new ApiError(404, "not_found", "Article not found");
  return updated;
});

export const DELETE = defineRoute(RIL_WRITE_SCOPE, async (ctx) => {
  const success = await deleteArticle(db, ctx.userId, ctx.param("id"));
  if (!success) throw new ApiError(404, "not_found", "Article not found");
  return noContent();
});
