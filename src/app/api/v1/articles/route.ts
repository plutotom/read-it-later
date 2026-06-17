import { RIL_READ_SCOPE, RIL_WRITE_SCOPE } from "~/lib/paraConstants";
import { db } from "~/server/db";
import {
  created,
  defineRoute,
  parseBody,
  parseBoolParam,
  parsePagination,
} from "~/server/lib/apiHandler";
import {
  createArticleFromText,
  createArticleFromUrl,
  listArticles,
} from "~/server/services/articleService";
import { articleCreateApiSchema } from "~/schemas/apiV1";

export const GET = defineRoute(RIL_READ_SCOPE, async (ctx) => {
  const { limit, cursor } = parsePagination(ctx.searchParams);
  const result = await listArticles(db, ctx.userId, {
    limit,
    cursor,
    folderId: ctx.searchParams.get("folderId") ?? undefined,
    tag: ctx.searchParams.get("tag") ?? undefined,
    q: ctx.searchParams.get("q") ?? undefined,
    isArchived: parseBoolParam(ctx.searchParams, "isArchived"),
    isRead: parseBoolParam(ctx.searchParams, "isRead"),
    isFavorite: parseBoolParam(ctx.searchParams, "isFavorite"),
  });
  return result;
});

export const POST = defineRoute(RIL_WRITE_SCOPE, async (ctx) => {
  const input = await parseBody(ctx, articleCreateApiSchema);

  const article = input.content
    ? await createArticleFromText(db, ctx.userId, {
        content: input.content,
        title: input.title!,
        author: input.author,
        publishedAt: input.publishedAt,
        url: input.url,
        folderId: input.folderId,
        tags: input.tags,
      })
    : await createArticleFromUrl(db, ctx.userId, {
        url: input.url!,
        folderId: input.folderId,
        tags: input.tags,
      });

  return created(article);
});
