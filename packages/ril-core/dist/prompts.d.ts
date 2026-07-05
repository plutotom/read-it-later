import { z } from "zod";
/**
 * The content-formatting guidance is the most important prompt in the system:
 * the reader renders this HTML verbatim, so structure determines formatting.
 */
export declare const ADD_ARTICLE_CONTENT_PROMPT = "Body for a manual text entry. Required when there is no url.\n\nIMPORTANT: send well-structured HTML, not a wall of text. The reader renders this HTML verbatim, so structure determines formatting.\n- Wrap every paragraph in its own <p>...</p>. Do NOT put the whole article in one <p>, and do NOT separate paragraphs with <br>.\n- Use <h2>/<h3> for section headings, <ul><li> for bullet lists, <ol><li> for numbered lists, <blockquote> for quotes, and <strong>/<em> for emphasis.\n- Keep each heading on its own tag \u2014 never let body text run inside a heading (e.g. <h2>Why This Matters</h2><p>Most people\u2026</p>, NOT <h2>Why This Matters Most people\u2026</h2>).\n\nExample: <h2>Section Title</h2><p>First paragraph.</p><p>Second paragraph.</p><ul><li>Point one</li><li>Point two</li></ul><blockquote><p>A quote.</p></blockquote>\n\nMarkdown is accepted as a fallback, but ONLY with a blank line between every block (heading, paragraph, list). Never send single-line \"flattened\" markdown or plain text with single line breaks \u2014 it collapses into one unformatted block. When in doubt, emit HTML.\n\nWhen the user pastes an email or newsletter:\n1. Strip email chrome: headers (From/To/Date/Subject), signatures, and promotional footers (conference promos, P.S. resource links, \"Cheers\").\n2. Keep the substantive article body: main argument, quotes, framework, and discussion questions if the user wants them included.\n3. Structure with headings for major sections and <p> tags for paragraphs.\n4. Put block quotes in <blockquote>. Use <ul><li> for bullet lists.\n5. Set author when the sender is clearly the author.\n6. Do NOT over-summarize unless asked \u2014 preserve the author's voice and key quotes. Clean up, don't rewrite into a short abstract.";
export declare const ADD_ARTICLE_DESCRIPTION = "Save a new article to the library.\n\nURL mode: pass `url` \u2014 the server fetches and extracts the page automatically.\n\nManual text mode: pass `title` + `content` (and optionally `author`, `tags`). Use this when the user pastes an email, newsletter, or notes they want saved as a readable article. Clean up pasted material before saving: remove email headers/footers/promos, keep the real content, and structure it as well-formed HTML (see the content field).\n\nProvide either a url, OR title + content for a manual entry \u2014 not both.";
export declare const addArticleShape: {
    url: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
};
export declare const SEARCH_ARTICLES_DESCRIPTION = "List the most recent articles in the user's read-it-later library, or search them by keyword. Returns article metadata (id, title, url, excerpt, tags, read/favorite/archived status, reading time). Use this to answer questions like \"my 5 most recent articles\" or to find the articles to operate on.";
export declare const searchArticlesShape: {
    query: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
    tag: z.ZodOptional<z.ZodString>;
    isRead: z.ZodOptional<z.ZodBoolean>;
    isFavorite: z.ZodOptional<z.ZodBoolean>;
    includeArchived: z.ZodOptional<z.ZodBoolean>;
};
export declare const GET_ARTICLE_CONTENT_DESCRIPTION = "Fetch the full readable text of a single article by its id. Use this to read an article before summarizing it or deciding appropriate tags. Long articles are truncated.";
export declare const getArticleContentShape: {
    articleId: z.ZodString;
};
export declare const UPDATE_ARTICLE_DESCRIPTION = "Update an article by id: set its tags, or change favorite/read/archived status or title. Use this to apply tags after reading an article. Setting tags REPLACES the article's existing tags, so include any current tags you want to keep.";
export declare const updateArticleShape: {
    articleId: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    title: z.ZodOptional<z.ZodString>;
    isFavorite: z.ZodOptional<z.ZodBoolean>;
    isRead: z.ZodOptional<z.ZodBoolean>;
    isArchived: z.ZodOptional<z.ZodBoolean>;
};
export declare const LIST_TAGS_DESCRIPTION = "List the tags already used across the user's library, with article counts. Call this before tagging so new tags stay consistent with the user's existing vocabulary instead of inventing near-duplicates.";
export declare const listTagsShape: {};
export declare const SHARE_ARTICLE_DESCRIPTION = "Create (or return the existing) public read-only share link for an article. Returns a shareToken and a shareUrl that anyone can open without logging in.";
export declare const shareArticleShape: {
    articleId: z.ZodString;
};
export declare const LIST_PARA_EXPORTS_DESCRIPTION = "List every article on the user's Para e-reader sync list. Returns export metadata (id, articleId, title, filename, bytes, isLarge). Use this to see what will sync to their device or to find an export id before removing.";
export declare const listParaExportsShape: {};
export declare const ADD_TO_PARA_DESCRIPTION = "Add an article to the Para e-reader sync list by article id. The article is converted to plain text and will appear on the user's device on the next sync. If the article is already on the list, its export is refreshed from the latest content.";
export declare const addToParaShape: {
    articleId: z.ZodString;
};
export declare const REMOVE_FROM_PARA_DESCRIPTION = "Remove an article from the Para e-reader sync list. Provide either exportId (from list_para_exports) or articleId (from search_articles). The device will delete the file on the next sync.";
export declare const removeFromParaShape: {
    exportId: z.ZodOptional<z.ZodString>;
    articleId: z.ZodOptional<z.ZodString>;
};
export declare const SEND_TO_KINDLE_DESCRIPTION = "Send an article to the user's Kindle via email. Requires the user to have completed Send to Kindle setup in the web app (Kindle email + Amazon approved sender). Converts the article to HTML and emails it as an attachment. Use force: true to resend even if an identical delivery already succeeded.";
export declare const sendToKindleShape: {
    articleId: z.ZodString;
    force: z.ZodOptional<z.ZodBoolean>;
};
export declare const LIST_KINDLE_DELIVERIES_DESCRIPTION = "List recent Send to Kindle delivery attempts. Returns status (sent, failed, pending), article title, and timestamps. Use this to check whether an article reached the user's Kindle or to debug failed sends.";
export declare const listKindleDeliveriesShape: {};
//# sourceMappingURL=prompts.d.ts.map