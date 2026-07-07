import { API_BASE } from "./api";
import type { Article } from "./types";

export const WEB_BASE = API_BASE.replace(/\/api\/v1\/?$/, "");

/** Manual text entries use a placeholder URL instead of a real source link. */
export function isManualArticleUrl(url: string): boolean {
  return url.startsWith("text://manual");
}

/** Browser-openable URL: RIL reader for manual entries, original URL otherwise. */
export function getArticleOpenUrl(article: Pick<Article, "id" | "url">): string {
  if (isManualArticleUrl(article.url)) {
    return `${WEB_BASE}/article/${article.id}`;
  }
  return article.url;
}
