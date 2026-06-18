import { getArticle, getArticleContent } from "../api";

/** Cap returned text so a long article doesn't blow up the model context. */
const MAX_CHARS = 20000;

type Input = {
  /**
   * The id of the article to read. Get this from the search-articles tool.
   */
  articleId: string;
};

/**
 * Returns the article's title plus its full readable text (plain text). Long
 * articles are truncated. Use this to read an article before summarizing it or
 * choosing tags for it.
 */
export default async function tool(input: Input) {
  const [article, content] = await Promise.all([
    getArticle(input.articleId),
    getArticleContent(input.articleId, "text"),
  ]);

  const truncated = content.length > MAX_CHARS;

  return {
    id: article.id,
    title: article.title || article.url,
    url: article.url,
    author: article.author,
    tags: article.tags ?? [],
    truncated,
    content: truncated ? content.slice(0, MAX_CHARS) : content,
  };
}
