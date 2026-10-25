# Native library protocol 1 — implementation contract

Work branch: `feature/ios-library-sync`, stacked on auth PR #22. No production migration or TestFlight upload is authorized. Discord preview callback testing is explicitly deferred by the user. Use isolated fixture data only; never access therapy content or real user articles.

The first complete slice syncs saved articles, text, favorite/read/archive flags and deletions. Existing local notes/highlights must survive import and text updates; annotation sync follows through explicit mapping, never guessed offsets.

## HTTP

All `/api/native/library` routes require a verified signed Better Auth Bearer session and strip cookies. Identity is server-derived. Responses are private/no-store. No endpoint fetches an arbitrary publisher URL or generates audio.

- `GET /api/native/library?cursor=<opaque>&limit=50`: `{protocolVersion:1, changes:[{revision:string,id:string,deleted:boolean,article:NativeArticle|null}],cursor:string,hasMore:boolean}`. NativeArticle: `{id,url,title,text,contentHash,format:"paper-drive-text-v1",isRead,isFavorite,isArchived,createdAt,updatedAt,contentUnavailable?:boolean}`. All dates ISO8601, all offsets UTF-16; text hash lowercase SHA256 of exact UTF8. Server canonical text is visible paragraph text with two LF separators, no Unicode normalization. Keep a source-offset map for future web highlight conversion. Canonical metadata is computed server-side from owned HTML.
- `POST /api/native/library/mutations`: `{protocolVersion:1,mutations:[Mutation]}` → `{protocolVersion:1,results:[{mutationId,status:"applied"|"deleted",articleId:string}]}`. At most 25 mutations and a bounded request size.
- Mutation: `{mutationId:UUID,kind:"create",articleId:UUID,url,title,text,isRead,isFavorite}` OR `{mutationId:UUID,kind:"update",articleId:UUID,patch:{isRead?,isFavorite?,isArchived?}}` OR `{mutationId:UUID,kind:"delete",articleId:UUID}`. Create accepts on-device extracted plain text, safely escaped for web presentation. Empty text saves a link without server fetching; a native-created pending-empty link can be filled once by a later on-device download. Existing URLs map to an owned server ID without overwriting existing content, annotations or flags.

All changes and cursor advancement apply atomically on the phone. Pending local assignments overlay remote values. Local-to-server mappings must preserve article IDs referenced by local annotations/bookmarks. Acknowledging an older mutation must not clear a newer queued edit. Original local content snapshots and quotes must remain recoverable before replacing text.

## Durable server ordering

A database migration captures all web and API article writers with triggers. Maintain a per-owner monotonic counter updated under a transaction-held owner row lock; sequence allocation cannot outrun commit order. A compact materialized change ledger keeps the latest article state/revision per ID plus permanent deletion tombstones. Coalescing intermediate updates is valid; each page is a consistent read, and a newer write moves the entity above the prior cursor. Bootstrap existing articles in the migration. Cursors are signed and owner-bound; reject invalid cursors. No retention expiry for this private beta. Oversized server text becomes a metadata-only record with `contentUnavailable:true`, empty text and its matching hash; this preserves identity, flags, deletions and cursor progress. Source URLs larger than 16 KiB stay unchanged on the server; their bounded device representation uses `text://unavailable/<id>` with `contentUnavailable:true`. Server IDs, not the display URL, remain authoritative. Unsuitable local uploads remain quarantined and recoverable while unrelated records continue syncing.

Mutations use durable owner-scoped idempotency records with canonical input hashes; same ID/different payload fails. Apply mutations/ledger/idempotency result atomically. Never resurrect deleted IDs through stale update/create. Patches contain only changed fields. Deduplicate URL saves under the same owner transaction lock; keep query parameters and conservative URL semantics. No new production uniqueness constraint that would delete existing duplicates.

## iOS

Add a SQLite migration for server mappings, durable pending assignments, cursor and original local text snapshots. Keep local-only reader tests unchanged unless explicitly using sync fixtures. The engine validates server/user identity, scopes requests to the session's origin, rejects redirects, and cancels stale account work. Offline saves/edits are immediately durable; retries use stable mutation IDs. Pull on launch/foreground/manual refresh, push on changes; show pending count, last sync/error and retry controls. Preserve original account data on sign-out.

## Speech follow-up

Reuse authenticated `/api/listening/catalog` and `/api/listening/stream`, server-owned article/revision/segment resolution and existing Google provider, durable cache and budgets. Native chunk descriptors must match the server segment IDs; do not pretend the current native splitter matches the web splitter. A server manifest can map canonical offsets to existing web segments. No real paid provider calls during development; synthetic PCM fixtures prove the client transport, not live voice latency.
