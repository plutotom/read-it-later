import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { articleCreateFromTextSchema } from "~/schemas/article";
import { auth } from "~/server/auth";
import { ZodError } from "zod";
import { createArticleFromText } from "~/server/services/articleService";

export async function POST(_req: NextRequest) {
  try {
    // Get session from auth
    const headersList = await headers();
    const session = await auth.api.getSession({
      headers: headersList,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: unknown = await _req.json();

    // Transform string dates to Date objects for REST API
    const bodyWithDate = body as { publishedAt?: string | Date };
    if (
      bodyWithDate.publishedAt &&
      typeof bodyWithDate.publishedAt === "string"
    ) {
      bodyWithDate.publishedAt = new Date(bodyWithDate.publishedAt);
    }

    // Validate input using the same schema as tRPC
    const validated = articleCreateFromTextSchema.parse(body);

    // Delegate to the shared service so manual content is normalized to HTML
    // (markdown / flattened markdown / plain text) before storage — keeping this
    // route in lockstep with the tRPC and public v1 API surfaces.
    const newArticle = await createArticleFromText(db, session.user.id, {
      content: validated.content,
      title: validated.title,
      author: validated.author,
      publishedAt: validated.publishedAt,
      url: validated.url,
      folderId: validated.folderId,
      tags: validated.tags,
    });

    return NextResponse.json(newArticle, { status: 201 });
  } catch (error) {
    console.error("Error creating article from text:", error);

    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: "Failed to create article",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
