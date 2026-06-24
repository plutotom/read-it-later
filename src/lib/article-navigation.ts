const DEFAULT_RETURN_TO = "/";

/** Build an article URL that records where the user came from. */
export function buildArticlePath(articleId: string, from: string): string {
  return `/article/${articleId}?from=${encodeURIComponent(from)}`;
}

/** Current location as a return path (pathname + query, no hash). */
export function currentPathFrom(
  pathname: string,
  searchParams: URLSearchParams,
): string {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Validate `from` — same-origin relative paths only. */
export function sanitizeReturnTo(from: string | null): string {
  if (!from?.startsWith("/") || from.startsWith("//")) {
    return DEFAULT_RETURN_TO;
  }

  try {
    const url = new URL(from, "http://localhost");
    if (url.username || url.password) return DEFAULT_RETURN_TO;
    return url.pathname + url.search + url.hash;
  } catch {
    return DEFAULT_RETURN_TO;
  }
}

export function getReturnToLabel(returnTo: string): string {
  if (returnTo === "/") return "Back to inbox";
  if (returnTo === "/archived") return "Back to archived articles";
  if (returnTo.startsWith("/search")) return "Back to search";
  if (returnTo.startsWith("/folder/")) return "Back to folder";
  if (returnTo === "/para") return "Back to Para";
  return "Go back";
}
