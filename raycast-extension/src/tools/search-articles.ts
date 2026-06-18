import { listArticles } from "../api";

type Input = {
  /**
   * Optional free-text query to search titles and content. Omit to list the
   * most recently saved articles.
   */
  query?: string;
  /**
   * Maximum number of articles to return. Defaults to 10, capped at 50.
   */
  limit?: number;
  /**
   * Only return articles with this exact tag.
   */
  tag?: string;
  /**
   * Filter by read status. true = only read, false = only unread.
   */
  isRead?: boolean;
  /**
   * Filter by favorite status.
   */
  isFavorite?: boolean;
  /**
   * Whether to include archived articles. Defaults to false, so only the active
   * inbox (non-archived) articles are returned. Set to true ONLY when the user
   * explicitly asks for archived items.
   */
  includeArchived?: boolean;
};

/**
 * Returns a page of the user's articles, newest first. Use the `query` field to
 * search, or omit it to get the most recent saves.
 */
export default async function tool(input: Input) {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
  const { data } = await listArticles({
    q: input.query,
    limit,
    tag: input.tag,
    isRead: input.isRead,
    isFavorite: input.isFavorite,
    isArchived: input.isArchived,
  });

  // Trim each article down to the fields useful for the model.
  return data.map((article) => ({
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
  }));
}
