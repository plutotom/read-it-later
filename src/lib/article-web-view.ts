/** Only navigable web URLs may be loaded into the original-site frame. */
export function getArticleWebUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export type ArticleViewMode = "reader" | "web";
