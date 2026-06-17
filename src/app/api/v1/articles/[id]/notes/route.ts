import { RIL_READ_SCOPE, RIL_WRITE_SCOPE } from "~/lib/paraConstants";
import { db } from "~/server/db";
import {
  ApiError,
  created,
  defineRoute,
  parseBody,
} from "~/server/lib/apiHandler";
import { createNote, listNotes } from "~/server/services/annotationService";
import { getArticle } from "~/server/services/articleService";
import { noteCreateApiSchema } from "~/schemas/apiV1";

export const GET = defineRoute(RIL_READ_SCOPE, async (ctx) => {
  return listNotes(db, ctx.userId, ctx.param("id"));
});

export const POST = defineRoute(RIL_WRITE_SCOPE, async (ctx) => {
  const article = await getArticle(db, ctx.userId, ctx.param("id"));
  if (!article) throw new ApiError(404, "not_found", "Article not found");

  const input = await parseBody(ctx, noteCreateApiSchema);
  const note = await createNote(db, ctx.userId, {
    ...input,
    articleId: ctx.param("id"),
  });
  return created(note);
});
