# Para Reader Integration — Implementation Spec

> Consolidated spec after design review. Ready to implement.

---

## Summary

Read It Later articles can be marked for sync to a Para e-reader device. The server exposes a PalaRead-compatible manifest + authenticated download endpoints. Users manage exports via `/para` and API keys via `/preferences`.

---

## User Flows

### Mark article for Para

1. User toggles **"Add to Para"** on article reader **or** article list row.
2. Server converts stored HTML → plain text (no images), creates a `para_export` record with a new stable UUID.
3. If export > 3 MB → show warning badge in UI; **never block**.
4. Works for all article sources (URL save, paste, `createFromText`, etc.).

### Remove from Para

1. User removes item on `/para` management page (or unmarks toggle on article — TBD: unmark should also remove export).
2. Export deleted from DB → absent from next manifest → device prunes on sync.

### Delete / archive article in library

- **Delete from library:** Para export **remains** (orphaned export; title unchanged).
- **Archive:** Para export **remains**.

### API keys (`/preferences`)

- General-purpose keys with `ril_` prefix.
- Multiple keys per user (labeled, e.g. "Heltec bedroom").
- Show full key **once** on creation; store hash only.
- Revoke supported.
- Display manifest URL for copy-paste: `https://<domain>/api/para/manifest`

### Device sync

1. `GET /api/para/manifest` with `Authorization: Bearer ril_...`
2. For each book entry, `GET` the absolute `url` from manifest (same auth header).
3. Firmware uses HTTPS for Vercel-hosted endpoints. `setInsecure()` is acceptable only for first bring-up/debug builds; stable firmware should use a pinned/root CA certificate because the bearer token crosses the public internet.
4. Firmware must stream downloads directly to a temp file and verify the exact raw bytes from the server. Do not normalize, compact, or rewrite the downloaded body on-device before comparing `bytes`/`sha256`.
5. Firmware keeps cloud metadata (`name`, `bytes`, `sha256`) and skips only when the local file plus metadata match the manifest. If `bytes` or `sha256` changes, download to `.tmp`, verify, replace the existing file, and update the metadata index.

---

## Data Model

### `read-it-later_para_export`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | Stable manifest `id`; new UUID each time article is marked |
| `userId` | text FK | Owner |
| `articleId` | uuid nullable FK | Null after source article deleted |
| `title` | text | Copied at export time |
| `filename` | text | ASCII slug + `.txt`; collision suffix `-2`, `-3`, … |
| `txtContent` | text | UTF-8 plain text body |
| `bytes` | integer | Byte length of txtContent |
| `sha256` | text | Lowercase hex of txtContent |
| `contentHash` | text | SHA-256 of source HTML at last conversion |
| `createdAt` | timestamp | When marked for Para |

Indexes: `userId`, `articleId`, `createdAt`.

**No soft-delete.** Removing from Para = hard delete row.

**Re-mark after remove:** Always new export row with new UUID (device treats as new book).

### `read-it-later_api_key`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `userId` | text FK | |
| `label` | text | User-facing name |
| `keyPrefix` | text | First ~8 chars after `ril_` for identification |
| `keyHash` | text | bcrypt or sha256 of full key |
| `scopes` | text[] | Default `['para:read']` — see Scopes section |
| `lastUsedAt` | timestamp nullable | Updated on successful auth |
| `revokedAt` | timestamp nullable | |
| `createdAt` | timestamp | |

### `read-it-later_article` (existing)

| Column | Type | Notes |
|--------|------|-------|
| `paraEnabled` | boolean | Optional convenience flag; source of truth is `para_export` existence |

Consider: derive `paraEnabled` from join rather than denormalized column. Simpler: check if active export exists for `articleId`.

---

## HTML → Plain Text Conversion

**Input:** `article.content` (Readability HTML)

**Steps:**

1. Parse HTML (`node-html-parser` or existing stack).
2. Remove: `script`, `style`, `img`, `picture`, `figure`, `svg`, `video`, `audio`, `iframe`, `object`, `embed`.
3. Extract visible text with paragraph breaks preserved (`structuredText` or equivalent).
4. Format output:

```
{title}
{= repeated for title length}

{body paragraphs separated by blank lines}
```

5. Slug filename from title: `sanitizeTxtFilename(title)` → `{slug}.txt`.
   - Filenames must be ASCII-only for firmware safety.
   - Allowed output: lowercase `a-z`, `0-9`, `-`, `_`, and `.txt`.
   - Keep filenames short enough for firmware path limits (`/books/<filename>` must fit the existing 96 byte path buffer).
6. Compute `bytes`, `sha256`, `contentHash` (hash of source HTML).

**Regeneration (Option C — smart cache):**

- On manifest/download request, if `article.content` hash ≠ stored `contentHash`, regenerate TXT in place (same export `id`, updated `bytes`/`sha256`/`txtContent`; filename remains stable).
- If source article deleted (`articleId` null), **do not** regenerate — frozen snapshot.
- Device re-downloads when `sha256` or `bytes` change by comparing manifest metadata against its cloud metadata index.

---

## API Endpoints

### Device-facing (API key auth)

| Method | Path | Auth | Response |
|--------|------|------|----------|
| `GET` | `/api/para/manifest` | Bearer `ril_...` | PalaRead manifest JSON |
| `GET` | `/api/para/articles/:id` | Bearer `ril_...` | `text/plain; charset=utf-8` body |

**Manifest shape:**

```json
{
  "version": 1,
  "books": [
    {
      "id": "uuid",
      "name": "article-title.txt",
      "url": "https://domain/api/para/articles/uuid",
      "sha256": "lowercase-hex-64",
      "bytes": 12345
    }
  ]
}
```

- Sort `books` by `name` ascending.
- Absolute URLs from request origin or `NEXT_PUBLIC_APP_URL`.
- Manifest JSON must stay within the firmware manifest budget. Target firmware cap: **64 KB**. Add tests or server-side checks if the manifest can approach that size.
- Device target: verified sync of at least **1 MB** text files. Test fixtures should include roughly `30 KB`, `250 KB`, `1 MB`, and `3 MB` exports.

**Auth middleware:**

- Extract Bearer token.
- Hash lookup in `api_key` table; check `revokedAt` is null.
- Verify scope includes `para:read`.
- Set `userId` on context; update `lastUsedAt`.
- Invalid/missing → `401`.

### Web UI (session auth via Better Auth)

| Method | Path | Purpose |
|--------|------|---------|
| tRPC `para.list` | | All exports for user (title, bytes, createdAt, articleId) |
| tRPC `para.add` | | Mark article → create export |
| tRPC `para.remove` | | Delete export by id |
| tRPC `para.getTotalBytes` | | Sum bytes for storage indicator |
| tRPC `apiKey.list` | | User's keys (no secrets) |
| tRPC `apiKey.create` | | Generate key, return once |
| tRPC `apiKey.revoke` | | Set revokedAt |

Alternatively REST under `/api/keys` — match existing `/api/preferences` pattern if simpler.

---

## UI

### `/preferences` — new "API Keys" card

- Create key (label input → show key once with copy button)
- List: label, prefix (`ril_abc1…`), created, last used, revoke button
- Manifest URL with copy button
- Brief setup instructions for device

### `/para` — Para management page

- Nav link in sidebar
- Table: title, size (bytes, human-readable), date added
- Warning icon if > 3 MB
- Total bytes footer
- Remove action per row
- Link to source article if `articleId` still exists

### Article reader + list row

- "Add to Para" toggle/checkbox
- If export exists → show as enabled
- Toggle off → remove export (same as `/para` remove)

---

## Firmware Requirements

### HTTPS and API keys

- Device stores manifest URL, Wi-Fi credentials, and Para API key.
- Device sends `Authorization: Bearer <key>` on both manifest and article download requests.
- Serial logs must never print the full API key. Log only whether auth is configured and, if needed, a short prefix.
- Public internet HTTPS should move from debug-only `setInsecure()` to root CA validation before treating the integration as production-stable.

### Large file handling

- Firmware must handle files larger than `30 KB`; acceptance target is a verified `1 MB` `.txt` download.
- Downloads must stream to `LittleFS` in chunks and never hold article bodies in RAM.
- Require `bytes` in every manifest entry. Reject entries with missing/zero bytes.
- Require enough free filesystem space for temp-file download and replacement overhead before starting a download.
- Preserve raw server bytes on disk so `sha256` and `bytes` match the manifest exactly.

### Cloud metadata index

Store one entry per cloud-managed book with:

```text
name
bytes
sha256
```

Sync behavior:

```text
if local file exists and metadata bytes/sha256 match manifest:
  skip as up-to-date
else:
  download to /books/<name>.tmp
  stream sha256 while writing raw bytes
  verify total bytes and sha256
  replace /books/<name>
  update metadata index
```

### Required serial logs

Add high-volume logs around the sync process so first-device testing can diagnose memory, stack, storage, network, auth, and server issues.

Log at sync start, after Wi-Fi connect, after manifest download, before each book, after each book, before/after prune, and sync end:

```text
[CloudSync] FS total=<bytes> used=<bytes> free=<bytes>
[CloudSync] Heap free=<bytes> min=<bytes> largest=<bytes>
[CloudSync] Stack high-water=<bytes>
```

Also log:

- manifest URL host/path and whether auth is configured
- Wi-Fi status, local IP, RSSI
- HTTP status codes, content length, bytes read, duration
- manifest byte count, parsed book count, and skipped entry reasons
- per-book name, expected bytes, sha presence, free-space decision, temp path, final path
- exact failure reason for bad URL, 401/403, timeout, early EOF, write failure, byte mismatch, SHA mismatch, rename failure, and metadata save failure
- final downloaded/deleted/skipped/failed counts

---

## Article Lifecycle Matrix

| Event | Para export |
|-------|-------------|
| Mark for Para | Create new export |
| Unmark / Remove from `/para` | Delete export |
| Delete article from library | Export **keeps** (`articleId` → null) |
| Archive article | Export **keeps** |
| Article content updated | Regenerate TXT if export linked (`contentHash` mismatch) |
| Re-mark after previous remove | New export, new UUID |

---

## API Key Scopes

**v1:** All keys get `['para:read']` only. No scope picker in UI.

**Schema:** Store `scopes text[]` from day one so future keys can add `articles:write`, `mcp:save`, etc. without a migration.

**Validation:** Device endpoints require `para:read`. Web key management ignores scopes for now.

---

## Size Warning

- Threshold: **3 MB** (3_145_728 bytes)
- UI only — never reject export or download
- Show badge/tooltip on `/para` list and optionally at mark time

---

## Related Docs

- [para-device-firmware-integration.md](./para-device-firmware-integration.md) — firmware AI brief

---

## Implementation Order

1. Schema migration: `para_export`, `api_key`
2. HTML → TXT converter + unit tests
3. API key generation + auth middleware
4. Device routes: manifest + download
5. tRPC: para + apiKey routers
6. `/para` page
7. Preferences API keys card
8. "Add to Para" toggle on reader + list
9. Manual end-to-end test with cURL before firmware update
