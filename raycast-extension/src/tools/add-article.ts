import { type Tool } from "@raycast/api";
import { createArticle } from "../api";
import type { ArticleCreate } from "../types";

type Input = {
  /**
   * The URL of a page to save. The page is fetched and parsed automatically.
   * Provide either a url, OR title + content for a manual entry — not both.
   */
  url?: string;
  /**
   * Title for a manual text entry. Required when there is no url.
   * Use a concise, descriptive title — not the email subject line verbatim if
   * it is vague.
   */
  title?: string;
  /**
   * Body for a manual text entry. Required when there is no url.
   *
   * **Format:** HTML (`<p>`, `<h2>`, `<h3>`, `<ul><li>`, `<blockquote>`).
   * Markdown also works as a fallback, but prefer semantic HTML.
   *
   * **When the user pastes an email or newsletter:**
   * 1. Strip email chrome: headers (From/To/Date/Subject), signatures, and
   *    promotional footers (conference promos, P.S. resource links, "Cheers").
   * 2. Keep the substantive article body: main argument, quotes, framework,
   *    and discussion questions if the user wants them included.
   * 3. Structure with headings for major sections (e.g. Scripture / Song /
   *    Story) and `<p>` tags for paragraphs.
   * 4. Put block quotes in `<blockquote>`. Use `<ul><li>` for bullet lists.
   * 5. Set `author` when the sender is clearly the author (e.g. "Jon Tyson").
   * 6. Do NOT over-summarize unless asked — preserve the author's voice and
   *    key quotes. Clean up, don't rewrite into a short abstract.
   */
  content?: string;
  /**
   * Author name when known (e.g. from an email signature or byline).
   */
  author?: string;
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
  if (input.author) body.author = input.author;
  if (input.tags && input.tags.length > 0) body.tags = input.tags;
  return body;
}

/**
 * Saves a new article to the library.
 *
 * **URL mode:** pass `url` — the server fetches and extracts the page.
 *
 * **Manual text mode:** pass `title` + `content` (and optionally `author`,
 * `tags`). Use this when the user pastes an email, newsletter, or notes they
 * want saved as a readable article. Clean up pasted material before saving:
 * remove email headers/footers/promos, keep the real content, structure it with
 * HTML headings and paragraphs.
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
