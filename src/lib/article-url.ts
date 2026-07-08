const ABSOLUTE_URL_PATTERN = /https?:\/\//gi;

export function getDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function embeddedUrlIndexes(value: string): number[] {
  const indexes: number[] = [];
  for (const match of value.matchAll(ABSOLUTE_URL_PATTERN)) {
    if (match.index !== undefined) indexes.push(match.index);
  }
  return indexes;
}

function hasPdfPath(value: string): boolean {
  try {
    return new URL(value).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

/**
 * Normalizes common copy/paste failures before the URL is fetched or stored.
 *
 * Browsers accept strings like `https://host/file.pdfhttps://host/file.pdf` as
 * one valid URL, but the remote asset server sees it as a bad `.pdfhttps...`
 * path and usually returns an HTML 404 page. Treat a second absolute URL inside
 * a PDF path as an accidental concatenation and keep the first PDF URL.
 */
export function normalizeArticleUrl(input: string): string {
  const trimmed = input.trim();
  const indexes = embeddedUrlIndexes(trimmed);

  if (indexes.length < 2) {
    return trimmed;
  }

  const firstUrl = trimmed.slice(0, indexes[1]);
  if (hasPdfPath(firstUrl)) {
    return firstUrl;
  }

  return trimmed;
}
