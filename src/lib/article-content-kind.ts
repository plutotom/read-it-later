import type {
  ArticleContentKind,
  ArticleMetadata,
  DocumentExtractionStatus,
} from "~/types/article";

export type { ArticleContentKind };

export const DOCUMENT_UNSUPPORTED_PARA_MESSAGE =
  "No text layer available — this document can't be synced to Para yet.";

export const DOCUMENT_UNSUPPORTED_TTS_MESSAGE =
  "No text layer available — Listen isn't supported for this document.";

/** @deprecated Use DOCUMENT_UNSUPPORTED_PARA_MESSAGE */
export const PDF_UNSUPPORTED_PARA_MESSAGE = DOCUMENT_UNSUPPORTED_PARA_MESSAGE;

/** @deprecated Use DOCUMENT_UNSUPPORTED_TTS_MESSAGE */
export const PDF_UNSUPPORTED_TTS_MESSAGE = DOCUMENT_UNSUPPORTED_TTS_MESSAGE;

export function getArticleContentKind(metadata: unknown): ArticleContentKind {
  if (!metadata || typeof metadata !== "object") return "html";

  const kind = (metadata as ArticleMetadata).contentKind;
  if (kind === "pdf" || kind === "epub" || kind === "text" || kind === "html") {
    return kind;
  }

  return "html";
}

export function isPdfArticle(article: { metadata?: unknown }): boolean {
  return getArticleContentKind(article.metadata) === "pdf";
}

export function isEpubArticle(article: { metadata?: unknown }): boolean {
  if (!article.metadata || typeof article.metadata !== "object") return false;
  return (article.metadata as ArticleMetadata).contentKind === "epub";
}

export function isDocumentArticle(article: { metadata?: unknown }): boolean {
  return isPdfArticle(article) || isEpubArticle(article);
}

export function getDocumentExtractionStatus(
  metadata: unknown,
): DocumentExtractionStatus | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  return (metadata as ArticleMetadata).extractionStatus;
}

export function hasExtractedText(article: {
  content: string;
  metadata?: unknown;
}): boolean {
  if (!isDocumentArticle(article)) return true;
  const status = getDocumentExtractionStatus(article.metadata);
  if (status === "complete") return true;
  return article.content.trim().length > 50;
}

export function documentNeedsExtractionWarning(article: {
  metadata?: unknown;
}): boolean {
  const status = getDocumentExtractionStatus(article.metadata);
  return status === "skipped" || status === "failed";
}
