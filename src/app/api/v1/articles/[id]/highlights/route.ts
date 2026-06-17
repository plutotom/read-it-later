import { RIL_READ_SCOPE, RIL_WRITE_SCOPE } from "~/lib/paraConstants";
import { db } from "~/server/db";
import {
  ApiError,
  created,
  defineRoute,
  parseBody,
} from "~/server/lib/apiHandler";
import {
  createHighlight,
  listHighlights,
} from "~/server/services/annotationService";
import { getArticle } from "~/server/services/articleService";
import { highlightCreateApiSchema } from "~/schemas/apiV1";

export const GET = defineRoute(RIL_READ_SCOPE, async (ctx) => {
  return listHighlights(db, ctx.userId, ctx.param("id"));
});

export const POST = defineRoute(RIL_WRITE_SCOPE, async (ctx) => {
  const article = await getArticle(db, ctx.userId, ctx.param("id"));
  if (!article) throw new ApiError(404, "not_found", "Article not found");

  const input = await parseBody(ctx, highlightCreateApiSchema);
  const highlight = await createHighlight(db, ctx.userId, {
    ...input,
    articleId: ctx.param("id"),
  });
  return created(highlight);
});
