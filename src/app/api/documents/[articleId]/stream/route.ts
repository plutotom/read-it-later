import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  getDocumentSourceUrl,
  getStreamablePdfArticle,
  proxyDocumentResponse,
} from "~/server/services/documentStreamService";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ articleId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { articleId } = await context.params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const shareToken = new URL(request.url).searchParams.get("shareToken");

  const article = await getStreamablePdfArticle(db, articleId, {
    userId: session?.user?.id,
    shareToken,
  });

  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sourceUrl = getDocumentSourceUrl(article);
  if (!sourceUrl) {
    return NextResponse.json(
      { error: "No document source available" },
      { status: 404 },
    );
  }

  try {
    return await proxyDocumentResponse(sourceUrl, request);
  } catch (error) {
    console.error("Document stream failed", {
      articleId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Failed to stream document" },
      { status: 502 },
    );
  }
}
