/**
 * MCP tool for saving articles to read-it-later
 */

import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// Input validation schema
const saveArticleInputSchema = z.object({
  content: z.string().min(1, "Content is required"),
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  author: z.string().max(200, "Author name too long").optional(),
  publishedAt: z
    .string()
    .datetime()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  folderId: z.string().uuid("Invalid folder ID format").optional(),
  tags: z
    .array(z.string().max(50, "Tag too long"))
    .max(20, "Too many tags")
    .optional(),
  baseUrl: z.string().url("Invalid base URL").optional(),
});

export const saveArticleTool: Tool = {
  name: "save_article_to_read_it_later",
  description:
    "Save an article to the read-it-later app. The article content can be HTML or plain text. The tool will automatically calculate word count and reading time.",
  inputSchema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description:
          "The article content in HTML or plain text format. This is required.",
      },
      title: {
        type: "string",
        description:
          "The title of the article (1-500 characters). This is required.",
      },
      author: {
        type: "string",
        description:
          "The author of the article (optional, max 200 characters).",
      },
      publishedAt: {
        type: "string",
        format: "date-time",
        description:
          "The publication date in ISO 8601 format (e.g., '2024-01-01T00:00:00Z'). Optional.",
      },
      folderId: {
        type: "string",
        format: "uuid",
        description:
          "The UUID of the folder to organize this article. Optional.",
      },
      tags: {
        type: "array",
        items: {
          type: "string",
        },
        description:
          "Array of tags for the article (max 20 tags, each max 50 characters). Optional.",
      },
      baseUrl: {
        type: "string",
        description:
          "Base URL of the read-it-later app (e.g., 'http://localhost:3000'). If not provided, uses READ_IT_LATER_BASE_URL environment variable or defaults to 'http://localhost:3000'.",
      },
    },
    required: ["content", "title"],
  },
};

export async function handleSaveArticle(
  args: unknown,
): Promise<{ success: boolean; articleId?: string; error?: string }> {
  try {
    // Validate input
    const validated = saveArticleInputSchema.parse(args);

    // Determine base URL
    const baseUrl =
      validated.baseUrl ??
      process.env.READ_IT_LATER_BASE_URL ??
      "http://localhost:3000";

    // Prepare article payload for REST API
    const payload = {
      content: validated.content,
      title: validated.title,
      ...(validated.author && { author: validated.author }),
      ...(validated.publishedAt && {
        publishedAt: validated.publishedAt.toISOString(),
      }),
      ...(validated.folderId && { folderId: validated.folderId }),
      ...(validated.tags &&
        validated.tags.length > 0 && { tags: validated.tags }),
    };

    // Call REST API endpoint
    const url = `${baseUrl.replace(/\/$/, "")}/api/articles/create-from-text`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP ${response.status}: ${response.statusText}. ${errorText}`,
      );
    }

    const article = (await response.json()) as { id: string };

    if (!article || !article.id) {
      throw new Error("Invalid response from API: missing article ID");
    }

    return {
      success: true,
      articleId: article.id,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(
        (e) => `${e.path.join(".")}: ${e.message}`,
      );
      return {
        success: false,
        error: `Validation error: ${errors.join(", ")}`,
      };
    }

    if (error instanceof Error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: `Unknown error: ${String(error)}`,
    };
  }
}
