# Read It Later — Raycast Extension

Browse, search, and save articles from your [read-it-later](https://ril.plutotom.com) library
directly from Raycast.

## Setup

1. Generate an API key in the read-it-later app (Settings → API keys). It needs the
   `ril:read` and `ril:write` scopes.
2. On first launch, paste the key into the **API Key** preference. The extension validates
   it against `/me` and shows a clear error if it's invalid or missing a scope.

## Commands

### Library

A searchable, paginated list of your saved articles.

- **Search** is debounced and hits `/search?q=…` (falls back to the full `/articles` list when empty).
- **Open Original URL** — open the source page in your browser.
- **View Content** (`⌘↵`) — read the extracted article text inside Raycast.
- **Copy Share Link** (`⌘.`) — creates a public share link via `POST /articles/{id}/share` and copies it.
- **Add/Remove Favorite** (`⌘F`), **Mark Read/Unread** (`⌘R`), **Archive/Unarchive** (`⌘E`) — `PATCH /articles/{id}`.
- **Delete Article** (`⌘⌃X`) — `DELETE /articles/{id}`, with a confirmation prompt.

### Add to Library

A form for saving new articles:

- Paste a **URL** to import a web page (`POST /articles { url }`), or
- Fill in **Title** + **Content** for a manual text entry.
- Optional comma-separated **tags**.

## AI tools (Raycast)

When using Raycast AI with this extension:

- **Manual text entries** need `title` + `content`. The reader renders HTML; markdown
  is also accepted and converted server-side.
- When pasting an **email or newsletter**, the AI should strip headers, signatures,
  conference promos, and P.S. resource blocks, then structure the real article body
  with headings and paragraphs. Set `author` when the sender is clear.
- Prefer preserving the author's voice over heavy summarization unless the user asks
  to shorten it.

## Development

```bash
npm install
npm run dev      # launches the extension in Raycast
npm run build    # type-checks and builds
npm run lint
```

The API is typed against the OpenAPI schema at
`https://ril.plutotom.com/api/v1/openapi.json` (see `src/types.ts`).
