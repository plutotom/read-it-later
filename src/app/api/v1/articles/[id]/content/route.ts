import { NextResponse } from "next/server";
import { RIL_READ_SCOPE } from "~/lib/paraConstants";
import { db } from "~/server/db";
import { ApiError, defineRoute } from "~/server/lib/apiHandler";
import { getArticle } from "~/server/services/articleService";
import { htmlToPlainText } from "~/server/services/paraTextConverter";

/**
 * Returns the article body. `?format=text` (default) yields clean plain text;
 * `?format=html` yields the stored HTML content.
 */
export const GET = defineRoute(RIL_READ_SCOPE, async (ctx) => {
  const article = await getArticle(db, ctx.userId, ctx.param("id"));
  if (!article) throw new ApiError(404, "not_found", "Article not found");

  const format = ctx.searchParams.get("format") ?? "text";
  if (format !== "text" && format !== "html") {
    throw new ApiError(400, "invalid_query", "format must be 'text' or 'html'");
  }

  const body =
    format === "html" ? article.content : htmlToPlainText(article.content);
  const contentType =
    format === "html"
      ? "text/html; charset=utf-8"
      : "text/plain; charset=utf-8";

  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
  });
});
