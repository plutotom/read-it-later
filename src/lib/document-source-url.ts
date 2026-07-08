export function getDocumentSourceUrl(article: {
  url: string;
  metadata: unknown;
}): string | null {
  const meta = article.metadata;
  if (meta && typeof meta === "object" && meta !== null) {
    const blobUrl = (meta as Record<string, unknown>).blobUrl;
    if (typeof blobUrl === "string" && blobUrl.startsWith("http")) {
      return blobUrl;
    }
  }

  const { url } = article;
  if (!url || url.startsWith("upload://") || url.startsWith("text://")) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
