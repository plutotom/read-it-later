import { type Tool } from "@raycast/api";
import { createArticle } from "../api";
import type { ArticleCreate } from "../types";

type Input = {
  /**
   * The URL of a page to save. The page is fetched and parsed automatically.
   * Provide either a url, or a title + content for a manual entry.
   */
  url?: string;
  /**
   * Title for a manual text entry. Required when there is no url.
   */
  title?: string;
  /**
   * Body text for a manual text entry. Required when there is no url.
   */
  content?: string;
  /**
   * Tags to apply to the new article.
   */
  tags?: string[];
};

function buildCreate(input: Input): ArticleCreate {
  const body: ArticleCreate = {};
  if (input.url) body.url = input.url;
  if (input.title) body.title = input.title;
  if (input.content) body.content = input.content;
  if (input.tags && input.tags.length > 0) body.tags = input.tags;
  return body;
}

/**
 * Saves a new article to the library, either from a URL or as a manual text
 * entry (title + content).
 */
export default async function tool(input: Input) {
  if (!input.url && !(input.title && input.content)) {
    throw new Error("Provide a url, or a title and content for a manual entry.");
  }
  const article = await createArticle(buildCreate(input));
  return {
    id: article.id,
    title: article.title || article.url,
    url: article.url,
    tags: article.tags ?? [],
  };
}

export const confirmation: Tool.Confirmation<Input> = async (input) => {
  return {
    title: "Add Article",
    message: input.url ? `Save ${input.url} to your library?` : `Save “${input.title}” to your library?`,
    info: input.tags && input.tags.length > 0 ? [{ name: "tags", value: input.tags.join(", ") }] : undefined,
  };
};
