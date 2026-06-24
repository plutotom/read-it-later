# Article navigation (`from` query param)

When a user opens an article from a list (inbox, archived, search, etc.), we record where they came from in the URL. The reader’s **Close** control is a real link back to that location.

This gives us three behaviors at once:

1. **Plain click** — returns to the list they came from (with view transitions)
2. **Cmd/Ctrl+Click** — opens that list in a new tab (native browser link behavior)
3. **Accessibility** — a proper `<a href="...">` with a descriptive `aria-label`

## How it works

### 1. Stamp `from` when navigating *to* an article

Every list entry point builds the article URL with a `from` param:

```
/article/{id}?from={encoded-return-path}
```

Example: opening an article from archived:

```
/article/abc-123?from=%2Farchived
```

### 2. Read and validate `from` in the reader

`ArticleDetailView` reads `from` from `useSearchParams()`, sanitizes it, and passes it to `ArticleReaderHeader`.

The **Close** button renders as:

```tsx
<Link href={returnTo} onClick={handleBackClick} aria-label={getReturnToLabel(returnTo)}>
  Close
</Link>
```

- **Modifier keys** (Cmd/Ctrl/Shift) — click is not intercepted; the browser opens `href` in a new tab.
- **Normal click** — `preventDefault()` + `router.push(returnTo)` so view transitions still run.

### 3. Fallback

If `from` is missing or invalid (direct link, bookmark, bad value), we default to `/` (inbox).

`sanitizeReturnTo` only allows same-origin relative paths starting with `/`. Open redirects like `//evil.com` are rejected.

## Helpers (`src/lib/article-navigation.ts`)

| Function | Purpose |
|----------|---------|
| `buildArticlePath(articleId, from)` | Article URL with encoded `from` |
| `currentPathFrom(pathname, searchParams)` | Current page as a return path (pathname + query) |
| `sanitizeReturnTo(from)` | Validate `from`; default to `/` |
| `getReturnToLabel(returnTo)` | Accessible label for the back link |

## Examples

### Inbox → article

```ts
import { buildArticlePath } from "~/lib/article-navigation";

router.push(buildArticlePath(article.id, "/"));
// → /article/abc-123?from=%2F
```

Close goes back to inbox. Cmd+Click opens inbox in a new tab.

### Archived → article

```ts
router.push(buildArticlePath(article.id, "/archived"));
// → /article/abc-123?from=%2Farchived
```

Close goes back to archived list.

### Search → article (preserve query)

```ts
import { buildArticlePath, currentPathFrom } from "~/lib/article-navigation";

const returnTo = currentPathFrom("/search", searchParams);
// e.g. "/search?q=typescript"

router.push(buildArticlePath(article.id, returnTo));
// → /article/abc-123?from=%2Fsearch%3Fq%3Dtypescript
```

Close returns to the same search results.

### Folder → article

```ts
router.push(buildArticlePath(article.id, `/folder/${folderId}`));
```

### Para → article (Link)

```tsx
<Link href={buildArticlePath(item.articleId, "/para")}>Open</Link>
```

### Reader back link (internal)

```tsx
// article-reader-header.tsx
const returnTo = sanitizeReturnTo(returnToProp ?? null);

<Link
  href={returnTo}
  onClick={(e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    withViewTransition(() => router.push(returnTo));
  }}
  aria-label={getReturnToLabel(returnTo)}
>
  Close
</Link>
```

## Where `from` is set today

| Entry point | `from` value |
|-------------|--------------|
| Inbox (`inbox-view.tsx`) | `/` |
| Archived (`archived/page.tsx`) | `/archived` |
| Search (`search/page.tsx`) | `/search` + query string |
| Folder (`folder/[id]/page.tsx`) | `/folder/{id}` |
| Para (`para/page.tsx`) | `/para` |

## Adding a new entry point

1. Import `buildArticlePath` (and `currentPathFrom` if the page has query params).
2. When navigating to an article, pass the current list path as `from`:

```ts
router.push(buildArticlePath(article.id, "/your-list-path"));
```

3. Optionally add a label in `getReturnToLabel` for accessibility.

Do **not** use `router.back()` for the reader close control — it has no stable URL and breaks Cmd+Click.

## Why not `router.back()` or `document.referrer`?

- **SPA navigation** often doesn’t update `document.referrer` reliably.
- **History stack** can include unexpected entries (external sites, add flow, etc.).
- **Cmd+Click** requires a real `href`; `history.back()` has no address to open in a new tab.

An explicit `from` param is predictable, testable, and works with links, keyboard, and screen readers.
