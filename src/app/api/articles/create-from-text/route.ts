import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { articles } from "~/server/db/schema";
import { articleCreateFromTextSchema } from "~/schemas/article";
import { JSDOM } from "jsdom";
import { ZodError } from "zod";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Transform string dates to Date objects for REST API
    if (body.publishedAt && typeof body.publishedAt === "string") {
      body.publishedAt = new Date(body.publishedAt);
    }

    // Validate input using the same schema as tRPC
    const validated = articleCreateFromTextSchema.parse(body);

    // Generate placeholder URL for text articles
    const placeholderUrl = `text://manual-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    // Calculate word count and reading time from HTML content
    const dom = new JSDOM(validated.content);
    const document = dom.window.document;
    const plainText = document.textContent || "";
    const wordCount = plainText
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
    const readingTime = Math.ceil(wordCount / 200); // 200 words per minute

    // Extract excerpt from first paragraph
    const firstParagraph = document.querySelector("p");
    const excerpt =
      firstParagraph?.textContent?.trim() || plainText.substring(0, 200).trim();

    const [newArticle] = await db
      .insert(articles)
      .values({
        url: placeholderUrl,
        title: validated.title,
        content: validated.content,
        excerpt: excerpt.length > 0 ? excerpt : null,
        author: validated.author || null,
        publishedAt: validated.publishedAt || null,
        wordCount: wordCount,
        readingTime: readingTime,
        folderId: validated.folderId || null,
        tags: validated.tags || null,
        metadata: {
          siteName: "Manual Entry",
          siteUrl: placeholderUrl,
          description: excerpt,
          language: "en",
          category: "Manual Entry",
        },
      })
      .returning();

    return NextResponse.json(newArticle, { status: 201 });
  } catch (error) {
    console.error("Error creating article from text:", error);

    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
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
