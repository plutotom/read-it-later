// Canonical, host-agnostic LLM tool definitions for read-it-later.
//
// This is the SINGLE SOURCE OF TRUTH for tool descriptions and input schemas.
// The MCP server imports these directly. The Raycast extension's tool files
// must keep their JSDoc in sync with the text here (Raycast's `ray build`
// derives its tool schemas from JSDoc in the tool source, so it can't import
// these at build time — keep the wording aligned manually).
//
// Each tool exposes:
//   - a `*_DESCRIPTION` string (the tool-level description), and
//   - a `*Shape` ZodRawShape (plain object of zod types), ready to pass to the
//     MCP SDK's `server.tool(name, description, shape, handler)`.

import { z } from "zod";

// ---- add_article ----------------------------------------------------------

/**
 * The content-formatting guidance is the most important prompt in the system:
 * the reader renders this HTML verbatim, so structure determines formatting.
 */
export const ADD_ARTICLE_CONTENT_PROMPT = `Body for a manual text entry. Required when there is no url.

IMPORTANT: send well-structured HTML, not a wall of text. The reader renders this HTML verbatim, so structure determines formatting.
- Wrap every paragraph in its own <p>...</p>. Do NOT put the whole article in one <p>, and do NOT separate paragraphs with <br>.
- Use <h2>/<h3> for section headings, <ul><li> for bullet lists, <ol><li> for numbered lists, <blockquote> for quotes, and <strong>/<em> for emphasis.
- Keep each heading on its own tag — never let body text run inside a heading (e.g. <h2>Why This Matters</h2><p>Most people…</p>, NOT <h2>Why This Matters Most people…</h2>).

Example: <h2>Section Title</h2><p>First paragraph.</p><p>Second paragraph.</p><ul><li>Point one</li><li>Point two</li></ul><blockquote><p>A quote.</p></blockquote>

Markdown is accepted as a fallback, but ONLY with a blank line between every block (heading, paragraph, list). Never send single-line "flattened" markdown or plain text with single line breaks — it collapses into one unformatted block. When in doubt, emit HTML.

When the user pastes an email or newsletter:
1. Strip email chrome: headers (From/To/Date/Subject), signatures, and promotional footers (conference promos, P.S. resource links, "Cheers").
2. Keep the substantive article body: main argument, quotes, framework, and discussion questions if the user wants them included.
3. Structure with headings for major sections and <p> tags for paragraphs.
4. Put block quotes in <blockquote>. Use <ul><li> for bullet lists.
5. Set author when the sender is clearly the author.
6. Do NOT over-summarize unless asked — preserve the author's voice and key quotes. Clean up, don't rewrite into a short abstract.`;

export const ADD_ARTICLE_DESCRIPTION = `Save a new article to the library.

URL mode: pass \`url\` — the server fetches and extracts the page automatically.

Manual text mode: pass \`title\` + \`content\` (and optionally \`author\`, \`tags\`). Use this when the user pastes an email, newsletter, or notes they want saved as a readable article. Clean up pasted material before saving: remove email headers/footers/promos, keep the real content, and structure it as well-formed HTML (see the content field).

Provide either a url, OR title + content for a manual entry — not both.`;

export const addArticleShape = {
  url: z
    .string()
    .url()
    .optional()
    .describe(
      "The URL of a page to save. The page is fetched and parsed automatically. Provide either a url, OR title + content for a manual entry — not both.",
    ),
  title: z
    .string()
    .optional()
    .describe(
      "Title for a manual text entry. Required when there is no url. Use a concise, descriptive title — not a vague email subject line verbatim.",
    ),
  content: z.string().optional().describe(ADD_ARTICLE_CONTENT_PROMPT),
  author: z
    .string()
    .optional()
    .describe("Author name when known (e.g. from an email signature or byline)."),
  tags: z.array(z.string()).optional().describe("Tags to apply to the new article."),
};

// ---- search_articles ------------------------------------------------------

export const SEARCH_ARTICLES_DESCRIPTION = `List the most recent articles in the user's read-it-later library, or search them by keyword. Returns article metadata (id, title, url, excerpt, tags, read/favorite/archived status, reading time). Use this to answer questions like "my 5 most recent articles" or to find the articles to operate on.`;

export const searchArticlesShape = {
  query: z
    .string()
    .optional()
    .describe(
      "Optional free-text query to search titles and content. Omit to list the most recently saved articles.",
    ),
  limit: z
    .number()
    .int()
    .optional()
    .describe("Maximum number of articles to return. Defaults to 10, capped at 50."),
  tag: z.string().optional().describe("Only return articles with this exact tag."),
  isRead: z
    .boolean()
    .optional()
    .describe("Filter by read status. true = only read, false = only unread."),
  isFavorite: z.boolean().optional().describe("Filter by favorite status."),
  includeArchived: z
    .boolean()
    .optional()
    .describe(
      "Whether to include archived articles. Defaults to false (only the active, non-archived inbox). Set true ONLY when the user explicitly asks for archived items.",
    ),
};

// ---- get_article_content --------------------------------------------------

export const GET_ARTICLE_CONTENT_DESCRIPTION = `Fetch the full readable text of a single article by its id. Use this to read an article before summarizing it or deciding appropriate tags. Long articles are truncated.`;

export const getArticleContentShape = {
  articleId: z
    .string()
    .describe("The id of the article to read. Get this from the search_articles tool."),
};

// ---- update_article -------------------------------------------------------

export const UPDATE_ARTICLE_DESCRIPTION = `Update an article by id: set its tags, or change favorite/read/archived status or title. Use this to apply tags after reading an article. Setting tags REPLACES the article's existing tags, so include any current tags you want to keep.`;

export const updateArticleShape = {
  articleId: z
    .string()
    .describe("The id of the article to update. Get this from the search_articles tool."),
  tags: z
    .array(z.string())
    .optional()
    .describe(
      "The complete set of tags for the article. REPLACES existing tags, so include any current tags you want to keep. Omit to leave tags unchanged.",
    ),
  title: z.string().optional().describe("New title for the article."),
  isFavorite: z
    .boolean()
    .optional()
    .describe("Mark the article as favorite (true) or remove favorite (false)."),
  isRead: z
    .boolean()
    .optional()
    .describe("Mark the article as read (true) or unread (false)."),
  isArchived: z
    .boolean()
    .optional()
    .describe("Archive (true) or unarchive (false) the article."),
};

// ---- list_tags ------------------------------------------------------------

export const LIST_TAGS_DESCRIPTION = `List the tags already used across the user's library, with article counts. Call this before tagging so new tags stay consistent with the user's existing vocabulary instead of inventing near-duplicates.`;

export const listTagsShape = {};

// ---- create_share_link ----------------------------------------------------

export const SHARE_ARTICLE_DESCRIPTION = `Create (or return the existing) public read-only share link for an article. Returns a shareToken and a shareUrl that anyone can open without logging in.`;

export const shareArticleShape = {
  articleId: z
    .string()
    .describe("The id of the article to create a public share link for."),
};
