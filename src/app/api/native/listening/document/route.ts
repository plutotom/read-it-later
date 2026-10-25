import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { JSDOM } from "jsdom";
import { z } from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { articles } from "~/server/db/schema";
import { createListeningDocument } from "~/lib/listening/document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };

/** Metadata only: this never resolves a provider or dispatches synthesis. */
export async function GET(request: Request) {
  if (!request.headers.get("authorization")?.startsWith("Bearer "))
    return Response.json({ code: "unauthorized" }, { status: 401, headers });
  const credentials = new Headers(request.headers);
  credentials.delete("cookie");
  try {
    const session = await auth.api.getSession({
      headers: credentials,
      query: { disableCookieCache: true },
    });
    if (!session)
      return Response.json({ code: "unauthorized" }, { status: 401, headers });
    const id = z
      .string()
      .uuid()
      .safeParse(new URL(request.url).searchParams.get("articleId"));
    if (!id.success)
      return Response.json(
        { code: "invalid_article" },
        { status: 400, headers },
      );
    const article = await db.query.articles.findFirst({
      where: and(
        eq(articles.id, id.data),
        eq(articles.userId, session.user.id),
      ),
      columns: { id: true, title: true, content: true },
    });
    if (!article)
      return Response.json({ code: "not_found" }, { status: 404, headers });
    if (article.content.length > 2_000_000)
      return Response.json(
        { code: "document_too_large" },
        { status: 413, headers },
      );
    const dom = new JSDOM(article.content);
    try {
      const document = createListeningDocument(dom.window.document.body);
      const canonical = document.canonical!;
      return Response.json(
        {
          protocolVersion: 1,
          articleId: article.id,
          title: article.title,
          format: "paper-drive-text-v1",
          offsetUnit: "utf16",
          text: canonical.text,
          contentHash: createHash("sha256")
            .update(canonical.text, "utf8")
            .digest("hex"),
          revision: document.revision,
          paragraphs: canonical.paragraphs,
          segments: canonical.segments,
        },
        { headers },
      );
    } finally {
      dom.window.close();
    }
  } catch {
    return Response.json(
      { code: "service_unavailable" },
      { status: 503, headers },
    );
  }
}
