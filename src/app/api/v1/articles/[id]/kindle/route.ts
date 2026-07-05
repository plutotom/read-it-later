import { eq } from "drizzle-orm";
import { RIL_WRITE_SCOPE } from "~/lib/paraConstants";
import { kindleDeliverySendApiSchema } from "~/schemas/apiV1";
import { db } from "~/server/db";
import { articles } from "~/server/db/schema";
import {
  ApiError,
  created,
  defineRoute,
  parseBody,
} from "~/server/lib/apiHandler";
import {
  KindleNotConfiguredError,
  sendArticleToKindle,
  serializeKindleDeliveryForApi,
  UnsupportedKindleContentError,
} from "~/server/services/kindleDeliveryService";

export const POST = defineRoute(RIL_WRITE_SCOPE, async (ctx) => {
  const articleId = ctx.param("id");
  const body = await parseBody(ctx, kindleDeliverySendApiSchema);

  try {
    const row = await sendArticleToKindle(db, ctx.userId, articleId, {
      force: body.force,
    });
    const article = await db.query.articles.findFirst({
      where: eq(articles.id, articleId),
      columns: { title: true },
    });
    return created(
      serializeKindleDeliveryForApi({
        ...row,
        articleTitle: article?.title ?? null,
      }),
    );
  } catch (error) {
    if (error instanceof KindleNotConfiguredError) {
      throw new ApiError(412, "precondition_failed", error.message);
    }
    if (error instanceof UnsupportedKindleContentError) {
      throw new ApiError(400, "unsupported_content", error.message);
    }
    if (error instanceof Error && error.message === "Article not found") {
      throw new ApiError(404, "not_found", error.message);
    }
    throw new ApiError(
      500,
      "delivery_failed",
      error instanceof Error ? error.message : "Failed to send to Kindle",
    );
  }
});
