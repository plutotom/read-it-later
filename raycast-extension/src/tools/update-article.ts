import { type Tool } from "@raycast/api";
import { getArticle, updateArticle } from "../api";
import type { ArticleUpdate } from "../types";

type Input = {
  /**
   * The id of the article to update. Get this from the search-articles tool.
   */
  articleId: string;
  /**
   * The complete set of tags for the article. This REPLACES the existing tags,
   * so include any current tags you want to keep. Omit to leave tags unchanged.
   */
  tags?: string[];
  /**
   * New title for the article.
   */
  title?: string;
  /**
   * Mark the article as favorite (true) or remove favorite (false).
   */
  isFavorite?: boolean;
  /**
   * Mark the article as read (true) or unread (false).
   */
  isRead?: boolean;
  /**
   * Archive (true) or unarchive (false) the article.
   */
  isArchived?: boolean;
};

function buildUpdate(input: Input): ArticleUpdate {
  const update: ArticleUpdate = {};
  if (input.tags !== undefined) update.tags = input.tags;
  if (input.title !== undefined) update.title = input.title;
  if (input.isFavorite !== undefined) update.isFavorite = input.isFavorite;
  if (input.isRead !== undefined) update.isRead = input.isRead;
  if (input.isArchived !== undefined) update.isArchived = input.isArchived;
  return update;
}

/**
 * Updates an article's tags and/or status flags. Setting `tags` replaces the
 * article's existing tags entirely.
 */
export default async function tool(input: Input) {
  const article = await updateArticle(input.articleId, buildUpdate(input));
  return {
    id: article.id,
    title: article.title || article.url,
    tags: article.tags ?? [],
    isFavorite: article.isFavorite,
    isRead: article.isRead,
    isArchived: article.isArchived,
  };
}

export const confirmation: Tool.Confirmation<Input> = async (input) => {
  const article = await getArticle(input.articleId);
  const update = buildUpdate(input);
  const changes = Object.entries(update).map(([key, value]) => ({
    name: key === "tags" ? "tags" : key,
    value: Array.isArray(value) ? value.join(", ") || "(none)" : String(value),
  }));

  return {
    title: "Update Article",
    message: `Update “${article.title || article.url}”?`,
    info: changes,
  };
};
