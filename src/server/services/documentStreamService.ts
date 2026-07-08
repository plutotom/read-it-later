import "server-only";

import { eq } from "drizzle-orm";
import { isPdfArticle } from "~/lib/article-content-kind";
import { getDocumentSourceUrl } from "~/lib/document-source-url";
import type { db as Db } from "~/server/db";
import { articles } from "~/server/db/schema";

type Database = typeof Db;

type StreamAccessOptions = {
  userId?: string;
  shareToken?: string | null;
};

export async function getStreamablePdfArticle(
  db: Database,
  articleId: string,
  opts: StreamAccessOptions,
) {
  const article = await db.query.articles.findFirst({
    where: eq(articles.id, articleId),
  });

  if (!article || !isPdfArticle(article)) {
    return null;
  }

  if (opts.userId && article.userId === opts.userId) {
    return article;
  }

  if (opts.shareToken && article.shareToken === opts.shareToken) {
    return article;
  }

  return null;
}

export { getDocumentSourceUrl };

const FETCH_USER_AGENT =
  "Mozilla/5.0 (compatible; ReadItLater/1.0; +https://github.com/mozilla/readability)";

export async function proxyDocumentResponse(
  sourceUrl: string,
  request: Request,
): Promise<Response> {
  const rangeHeader = request.headers.get("range");
  const upstreamHeaders: HeadersInit = {
    "User-Agent": FETCH_USER_AGENT,
  };

  if (rangeHeader) {
    upstreamHeaders.Range = rangeHeader;
  }

  const upstream = await fetch(sourceUrl, {
    headers: upstreamHeaders,
    redirect: "follow",
  });

  if (!upstream.ok && upstream.status !== 206) {
    return new Response("Failed to fetch document", {
      status: upstream.status === 404 ? 404 : 502,
    });
  }

  const responseHeaders = new Headers();
  const contentType =
    upstream.headers.get("content-type") ?? "application/pdf";
  responseHeaders.set("Content-Type", contentType);
  responseHeaders.set("Content-Disposition", "inline");
  responseHeaders.set("Cache-Control", "private, max-age=3600");

  const contentRange = upstream.headers.get("content-range");
  const contentLength = upstream.headers.get("content-length");
  const upstreamAcceptRanges = upstream.headers.get("accept-ranges");
  if (contentRange) responseHeaders.set("Content-Range", contentRange);
  if (contentLength) responseHeaders.set("Content-Length", contentLength);
  if (upstreamAcceptRanges && upstreamAcceptRanges.toLowerCase() !== "none") {
    responseHeaders.set("Accept-Ranges", upstreamAcceptRanges);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
