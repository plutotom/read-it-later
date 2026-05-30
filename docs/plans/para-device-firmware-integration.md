# Para Device Firmware Integration — AI Implementation Brief

> **Audience:** An AI agent (or developer) modifying the ESP32 e-reader firmware.  
> **Do not modify** the Read It Later web app as part of this task — only firmware.  
> **Context:** Read It Later is replacing the standalone PalaRead web server. The device must sync from the hosted app instead of a local LAN server.

---

## Goal

Update the existing cloud sync firmware so it can authenticate against Read It Later and pull the user's Para article list from a remote HTTPS manifest, instead of (or in addition to) an unauthenticated local PalaRead server.

---

## Current Behavior (Baseline — Do Not Break)

The firmware already implements **cloud sync v1** against PalaRead. Preserve this behavior unless explicitly changed below.

### Sync flow today

1. User configures a **manifest URL** (e.g. `http://192.168.1.42:8787/manifest.json`).
2. Firmware `GET`s the manifest with **closed HTTP connections** (important on ESP32 — avoid keep-alive reuse).
3. Manifest JSON shape:

```json
{
  "version": 1,
  "books": [
    {
      "id": "stable-id-string",
      "name": "book-title.txt",
      "url": "http://host:port/books/book-title.txt",
      "sha256": "optional-lowercase-hex-64",
      "bytes": 12345
    }
  ]
}
```

4. For each entry in `books[]`:
   - `GET` the `url`
   - Save to root-level `/books/<name>` on device filesystem
   - Validate download size against `bytes` (reject truncated downloads)
   - Optionally verify `sha256` if present
5. Maintain `/cloud_sync_v1.txt` — a newline-delimited index of **cloud-managed filenames**.
6. **Pruning:** On sync, delete root-level `/books/<name>` files that are in the cloud index but **no longer in the manifest**.
7. **Scope of pruning:**
   - Only root-level `/books/<name>` files tracked in `cloud_sync_v1.txt`
   - Books moved into subfolders on device are **not** deleted
   - Manual uploads not in the cloud index are **not** deleted
8. First sync after firmware install bootstraps the cloud index from existing root-level `.txt` files.

### Reference firmware location

- Sketch directory: `HeltecV1_2_Pala_One_2_0_custom/HeltecV1_2_Pala_One_2_1`
- Board: Heltec Wireless Paper
- FQBN: `esp32:esp32:heltec_wireless_paper`
- PalaRead server docs (manifest contract): sibling folder `palaread-web-app/README.md`

---

## Required Changes

### 1. New configuration fields

Add device-side config (NVS, SPIFFS, or existing settings store — match project conventions):

| Setting | Example | Notes |
|---------|---------|-------|
| `manifest_url` | `https://read-it-later.com/api/para/manifest` | User sets this in device UI |
| `api_key` | `ril_xxxxxxxxxxxxxxxx` | Secret; user copies from Read It Later `/preferences` |

**Backward compatibility:** If `api_key` is empty, behave as today (no auth header) so local PalaRead servers still work during transition.

### 2. Authenticated HTTP requests

When `api_key` is set, include on **every** sync request (manifest + each book download):

```
Authorization: Bearer <api_key>
```

Use the same header name and format for all sync HTTP calls.

**Do not** put the API key in query strings or URL paths.

### 3. HTTPS support

Read It Later is hosted over **HTTPS** on the public internet (not LAN-only HTTP).

Ensure the firmware HTTP client:

- Supports TLS/HTTPS for the production domain
- Handles certificate validation appropriately for ESP32 (use existing project CA/cert approach if one exists; do not disable TLS verification in production builds without explicit user opt-in)
- Still uses **closed connections** per request (existing ESP32 workaround)

### 4. Manifest URL change only

The manifest path changes from `/manifest.json` to `/api/para/manifest`. Book download URLs will be **absolute URLs** inside each manifest entry's `url` field — firmware should continue to `GET` whatever URL the manifest provides (do not hardcode `/books/` paths).

Example production manifest entry:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "how-to-build-habits.txt",
  "url": "https://read-it-later.com/api/para/articles/550e8400-e29b-41d4-a716-446655440000",
  "sha256": "abc123...",
  "bytes": 48291
}
```

### 5. Error handling for auth failures

| HTTP status | Meaning | Device behavior |
|-------------|---------|-----------------|
| `401 Unauthorized` | Invalid/revoked API key | Show clear error; do not prune local books; do not update cloud index |
| `403 Forbidden` | Key valid but not allowed | Same as 401 |
| `200 OK` | Success | Normal sync |
| Network/TLS failure | Connectivity | Retry with backoff; preserve existing local books |

**Critical:** On auth failure, **do not run the prune step**. A failed manifest fetch must not delete local content.

### 6. Preserve manifest contract

These fields and semantics are unchanged:

- `version` must be `1`
- `books[]` sorted by `name` ascending (server guarantees this; firmware may assume)
- `bytes` required — reject partial downloads
- `sha256` optional — verify if present
- `id` is stable per article — use for logging/debugging; filename on disk comes from `name`

### 7. Device UI updates

Add or extend settings screen:

- **Manifest URL** text field (pre-fill suggestion: `https://read-it-later.com/api/para/manifest`)
- **API Key** text field (masked/password style if possible)
- **Test connection** button: `GET manifest_url` with auth, show book count or error message
- Clear help text: "Generate API keys in Read It Later → Preferences"

Remove or de-emphasize LAN-only instructions if the app now defaults to cloud hosting.

---

## What NOT to Change

- Local manual book upload UX on device (if it exists)
- Folder organization on device
- Cloud prune scope (`cloud_sync_v1.txt` logic)
- Root-level save path `/books/<name>`
- Closed HTTP connection behavior per sync request
- Partial download rejection via `bytes` check

---

## Testing Checklist

### Against Read It Later staging/production

1. Configure manifest URL + valid API key → sync succeeds, books appear in `/books/`
2. Invalid API key → `401`, no local books deleted
3. Remove one article from Para list in web app → next sync prunes that file from device
4. Large file (~3 MB warning threshold) → downloads completely; `bytes` matches
5. `sha256` mismatch (if server sends it) → reject re-download or flag error (match existing firmware behavior)
6. HTTPS handshake succeeds on target domain
7. Sync with empty `api_key` against legacy local PalaRead server still works (backward compat)

### cURL equivalents for debugging (host machine)

```bash
# Manifest
curl -s -H "Authorization: Bearer ril_YOUR_KEY" \
  https://read-it-later.com/api/para/manifest | jq .

# Download one article
curl -s -H "Authorization: Bearer ril_YOUR_KEY" \
  https://read-it-later.com/api/para/articles/ARTICLE_UUID -o test.txt

# Auth failure
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer invalid" \
  https://read-it-later.com/api/para/manifest
# Expect: 401
```

---

## Implementation Notes for AI Agent

1. **Find existing cloud sync code first** — search for `cloud_sync_v1`, `manifest.json`, manifest parsing, and HTTP client wrappers before adding new modules.
2. **Minimal diff** — add auth header injection at the HTTP layer used by sync, not duplicated per call site.
3. **Secrets** — store API key in NVS/flash; never log the full key (truncate in serial debug output).
4. **Memory** — ESP32 has limited RAM; stream downloads to SD/SPIFFS where possible; do not buffer multi-MB files in heap.
5. **Compile target:** `esp32:esp32:heltec_wireless_paper`
6. **Do not** modify the Read It Later repository or the PalaRead web server — firmware only.

---

## Open Firmware Questions (Resolve During Implementation)

- Does the project already have an HTTPS/TLS helper, or does this need mbedTLS/Arduino `WiFiClientSecure` setup?
- Where is manifest URL currently stored in NVS/settings?
- Is there an existing "sync now" vs "scheduled sync" trigger to hook into?
- Should the device display article **title** from manifest `name` (minus `.txt`) in a library list, or only show filenames?

---

## Success Criteria

- User can paste API key + manifest URL from Read It Later preferences and sync articles over HTTPS
- Manifest contract and prune semantics match PalaRead v1 behavior
- Auth failures are safe (no accidental mass deletion)
- Legacy unauthenticated local PalaRead sync still works when API key is blank
