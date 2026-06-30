import type { ArticleMetadata } from "~/types/article";

export type ArticleContentKind = "html" | "pdf" | "text";

export const PDF_UNSUPPORTED_PARA_MESSAGE =
  "PDFs can't be synced to Para yet. Open the original link to read the document.";

export const PDF_UNSUPPORTED_TTS_MESSAGE =
  "Listen isn't available for PDFs yet.";

export function getArticleContentKind(metadata: unknown): ArticleContentKind {
  if (!metadata || typeof metadata !== "object") return "html";

  const kind = (metadata as ArticleMetadata).contentKind;
  if (kind === "pdf" || kind === "text" || kind === "html") {
    return kind;
  }

  return "html";
}

export function isPdfArticle(article: { metadata?: unknown }): boolean {
  return getArticleContentKind(article.metadata) === "pdf";
}
