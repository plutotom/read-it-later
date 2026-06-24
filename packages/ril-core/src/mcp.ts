// Shared MCP tool registration. Wires the framework-agnostic RilClient + the
// shared prompts/shapes into the MCP SDK. Both the standalone stdio server
// (`mcp-server/`) and the hosted Next.js route (`/api/mcp`) import this so the
// tool surface stays identical across transports.
//
// This module pulls in `@modelcontextprotocol/sdk`, so it is exposed only via
// the `@read-it-later/core/mcp` subpath — plain API-client consumers (Raycast)
// import `@read-it-later/core` and never load the SDK.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ApiError, type RilClient } from "./client.js";
import type { ArticleCreate, ArticleUpdate } from "./types.js";
import {
  ADD_ARTICLE_DESCRIPTION,
  GET_ARTICLE_CONTENT_DESCRIPTION,
  LIST_TAGS_DESCRIPTION,
  SEARCH_ARTICLES_DESCRIPTION,
  SHARE_ARTICLE_DESCRIPTION,
  UPDATE_ARTICLE_DESCRIPTION,
  addArticleShape,
  getArticleContentShape,
  listTagsShape,
  searchArticlesShape,
  shareArticleShape,
  updateArticleShape,
} from "./prompts.js";

/** Cap returned article text so a long article doesn't blow up the model context. */
const MAX_CONTENT_CHARS = 20000;

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown): ToolResult {
  const message =
    error instanceof ApiError || error instanceof Error
      ? error.message
      : String(error);
  return { content: [{ type: "text", text: message }], isError: true };
}

export function registerTools(server: McpServer, client: RilClient): void {
  server.tool(
    "add_article",
    ADD_ARTICLE_DESCRIPTION,
    addArticleShape,
    async (input) => {
      try {
        if (!input.url && !(input.title && input.content)) {
          return fail(new Error("Provide a url, or a title and content for a manual entry."));
        }
        const body: ArticleCreate = {};
        if (input.url) body.url = input.url;
        if (input.title) body.title = input.title;
        if (input.content) body.content = input.content;
        if (input.author) body.author = input.author;
        if (input.tags && input.tags.length > 0) body.tags = input.tags;

        const article = await client.createArticle(body);
        return ok({
          id: article.id,
          title: article.title || article.url,
          url: article.url,
          tags: article.tags ?? [],
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "search_articles",
    SEARCH_ARTICLES_DESCRIPTION,
    searchArticlesShape,
    async (input) => {
      try {
        const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
        const { data } = await client.listArticles({
          q: input.query,
          limit,
          tag: input.tag,
          isRead: input.isRead,
          isFavorite: input.isFavorite,
          // Default to the active inbox; only include archived when explicitly asked.
          isArchived: input.includeArchived ? undefined : false,
        });
        return ok(
          data.map((article) => ({
            id: article.id,
            title: article.title || article.url,
            url: article.url,
            excerpt: article.excerpt,
            author: article.author,
            tags: article.tags ?? [],
            isRead: article.isRead,
            isFavorite: article.isFavorite,
            isArchived: article.isArchived,
            readingTime: article.readingTime,
            createdAt: article.createdAt,
          })),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "get_article_content",
    GET_ARTICLE_CONTENT_DESCRIPTION,
    getArticleContentShape,
    async (input) => {
      try {
        const [article, content] = await Promise.all([
          client.getArticle(input.articleId),
          client.getArticleContent(input.articleId, "text"),
        ]);
        const truncated = content.length > MAX_CONTENT_CHARS;
        return ok({
          id: article.id,
          title: article.title || article.url,
          url: article.url,
          author: article.author,
          tags: article.tags ?? [],
          truncated,
          content: truncated ? content.slice(0, MAX_CONTENT_CHARS) : content,
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool(
    "update_article",
    UPDATE_ARTICLE_DESCRIPTION,
    updateArticleShape,
    async (input) => {
      try {
        const update: ArticleUpdate = {};
        if (input.tags !== undefined) update.tags = input.tags;
        if (input.title !== undefined) update.title = input.title;
        if (input.isFavorite !== undefined) update.isFavorite = input.isFavorite;
        if (input.isRead !== undefined) update.isRead = input.isRead;
        if (input.isArchived !== undefined) update.isArchived = input.isArchived;

        if (Object.keys(update).length === 0) {
          return fail(new Error("Provide at least one field to update."));
        }

        const article = await client.updateArticle(input.articleId, update);
        return ok({
          id: article.id,
          title: article.title || article.url,
          tags: article.tags ?? [],
          isFavorite: article.isFavorite,
          isRead: article.isRead,
          isArchived: article.isArchived,
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.tool("list_tags", LIST_TAGS_DESCRIPTION, listTagsShape, async () => {
    try {
      const tags = await client.getTags();
      return ok(tags.map((tag) => ({ name: tag.name ?? tag.tag ?? "", count: tag.count ?? 0 })));
    } catch (error) {
      return fail(error);
    }
  });

  server.tool(
    "create_share_link",
    SHARE_ARTICLE_DESCRIPTION,
    shareArticleShape,
    async (input) => {
      try {
        const result = await client.shareArticle(input.articleId);
        return ok({ shareToken: result.shareToken, shareUrl: result.shareUrl });
      } catch (error) {
        return fail(error);
      }
    },
  );
}
