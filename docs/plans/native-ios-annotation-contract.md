# Native annotation sync protocol 2

Stack: auth PR #22 → article/listening PR #23 → this annotation layer. No production migrations, merge, paid synthesis, separate iOS Vercel project or TestFlight upload. Use synthetic isolated fixtures only; never access therapy content or real user documents.

## Versioning and wire format

Protocol 1 remains unchanged. GET `/api/native/library?protocolVersion=2` opts into `{protocolVersion:2,changes,cursor,hasMore}`. Protocol-2 changes keep the existing article fields and add an `annotations` sibling for live records:

```
{ complete:true, notes:NativeNote[], highlights:NativeHighlight[], deleted:[{kind:"note"|"highlight",id:UUID}] }
```

Snapshots are read under the same repeatable-read transaction as their article. Bound each entire response, including annotations. A snapshot that cannot fit within 1 MiB per change has `{complete:false,reason:"annotation_limit"}` without collections. It is explicitly unavailable, never an empty authoritative snapshot. Clients preserve existing local annotations and surface the limitation. Mutation notes/text remain bounded; no silent truncation.

NativeNote: `{id,articleId,highlightId:string|null,content,createdAt,updatedAt}`.
NativeHighlight: `{id,articleId,color,sourceAnchor,canonicalAnchor:null|CanonicalAnchor,resolution:"anchored"|"unresolved",createdAt,updatedAt}`.
Incoming historical `web-dom-v1` selectors may retain an empty legacy hash or inconsistent old range as recoverable source data. These values never authorize native uploads or painting; new mutation selectors remain strict, and derived placement must pass current-text validation.

SourceAnchor: `{space:"web-dom-v1"|"paper-drive-text-v1"|"local-text-v1",text,startOffset,endOffset,contextPrefix,contextSuffix,contentHash}`.
CanonicalAnchor: `{text,startOffset,endOffset,contentHash}` into the exact canonical UTF-16 text, SHA-256 of UTF8. The source selector is never rewritten by a derived placement.

POST `/api/native/library/mutations` accepts protocolVersion 1 as before; protocolVersion 2 additionally supports these strict kinds under the existing transaction, owner lock, receipts, aliases, body size and rate limits:

- `note.create`: `{mutationId,kind,articleId,noteId,content,highlightId?:UUID|null}`
- `note.update`: `{mutationId,kind,articleId,noteId,patch:{content:string}}`
- `note.delete`: `{mutationId,kind,articleId,noteId}`
- `highlight.create`: `{mutationId,kind,articleId,highlightId,color,sourceAnchor}`
- `highlight.update`: `{mutationId,kind,articleId,highlightId,patch:{color}}`
- `highlight.delete`: `{mutationId,kind,articleId,highlightId}`

All eight web colors remain exact. Results retain `{mutationId,status:"applied"|"deleted",articleId}` with optional `annotationId` and annotation-only `effectRevision` (decimal account revision captured after the mutation effect and retained verbatim in its receipt). Deleted annotation results also carry optional `permanentDeletion`: true when the owned entity is physically absent, false when it remains live under another parent. The client keeps a permanent identity watermark only for a confirmed physical deletion. Both fields are persisted in exact receipts; neither advances the pull cursor. A deleted annotation result must NEVER mark the parent article as deleted. UUID identities are supplied once by the client and stay stable; global ID collisions must not select another owner's row. Content/color updates patch only that field, preserving web tags, note positioning and source selectors. Replaying a receipt performs no write; changed-input reuse fails.

## Server storage and all writers

Migration 0017 compatibly restores missing legacy anchor columns and owner-matched deletion cascades, then adds an annotation identity/tombstone ledger and highlight columns `anchorSpace` (default `web-dom-v1`), `sourceAnchor` jsonb and `webAnchor` jsonb, reflected in Drizzle schema. AFTER triggers on notes/highlights allocate revisions through the existing owner counter, update the parent article's compact change entry without changing article.updatedAt/content/audio identities, and retain permanent child deletion IDs. Child cascades during parent deletion must not resurrect an article ledger entry. Relationship moves invalidate old and new parents; ownership still follows 0016. Capture OLD identities on delete. Bootstrap only valid owned relationships under migration locks. No reading or repairing production rows during development.

Deletion identities are scoped to their parent relationship. Moving an annotation A → B → A must remain representable; native storage records the observed parent revision and keeps local pending deletion overlays separate from verified live relationships. A receipt for an old parent cannot hide the newer relationship.

Local article aliases of the same server ID share one persisted annotation parent while retaining their individual reader IDs and text versions. Assignments rejected only because their parent moved remain durable until the new owned relationship is discovered, then use a fresh mutation identity. Incoming complete snapshots use response byte budgets rather than mutation text limits.

A protocol-2 client resets its cursor to zero once when enabling annotations, retaining article mappings, pending work and saved versions. New annotation snapshots then include existing historical notes/highlights.

## Conservative anchoring

Shared helpers in `src/lib/annotation-anchor.ts` provide strict source-anchor validation, canonical projection, and verified web projection. Use the canonical parser from `native-library-document.ts`; its sourceOffsets are NOT generally invertible. Only map a selector when boundaries and every UTF-16 character round-trip. A canonical range crossing a synthetic separator, collapsed whitespace, hidden/script content or a duplicated source offset may remain unresolved. Never bridge omitted content with a guessed enclosing range.

For native selectors, trust canonical placement only if source SHA-256 equals current canonical hash and exact offsets/quote match. A legacy local hash mismatch remains an unresolved saved quote; never guess the first matching occurrence. If safely mapped to DOM, store a separate webAnchor using exact DOM text, UTF-16 positions and cyrb53; preserve original sourceAnchor. Native source columns mirror the original selector for compatibility; web rendering must dispatch by anchorSpace before the legacy resolver.

Existing web DOM anchors can use the corrected unique-only legacy resolver. Export a separate canonical projection only when it round-trips safely. Explicit unresolved status must prevent native selectors from falling through to web DOM re-anchoring. Reading/painting must not generate relocation writebacks for native source selectors.

Parent owns strict `highlight-anchor.ts` fixes, web painter/types and UIKit highlight colors. Server child owns schema/migration/helper/service/protocol-2 routes; Swift child owns annotation storage/queue/protocol and core tests.

## Native storage, mutations and recovery

Add SQLite migrations v5/v6 with independent note rows, annotation deletion state/source selectors/canonical projections, bootstrap marker and any needed queue fields. Add optional protocol-2 fields to existing wire structs. Keep protocol-1 fixtures and local-only readers working. `NativeLibraryClient(protocolVersion:2)` opts in; default remains 1. `enableAnnotationSync(session:)` binds account, resets cursor once, and queues legacy annotations after article creates. Stable IDs/import markers must commit atomically.

Legacy inline article.note imports once into its own persisted UUID; preserve the inline original for recovery. Do not merge notes by equal text. Existing legacy highlight UUIDs remain stable. New highlights use canonical space only when displayed text/hash matches the retained canonical document; otherwise use local space. Never discard old quote/source selectors during text changes.

Atomic local writes enqueue `saveNote`/create/update/delete note and highlight/color edits. Parent needs `annotationSyncEnabled`, `notes(articleId:)`, `createNote(articleId:content:highlightId:)`, `updateNote(id:content:)`, `deleteNote(id:)`, and existing highlight APIs. Return public `LibraryNote` records with stable id/articleId/highlightId/content/dates. Legacy local-only saveNote still updates article.note so old reader tests remain valid. Server snapshots merge complete collections by identity and overlay pending field assignments. Missing records in an incomplete snapshot do not imply deletion. Tombstones beat stale offline creates/updates.

Per-article serialization in the outbox ensures article mappings and highlight IDs resolve before dependent annotation dispatch. Frozen requests never change; ACKs clear only their own mutation. Parent article mapping/deletion handling must distinguish child results. Export format 4 includes independent notes, source/projection metadata, preserved text versions and recovery records, never credentials or receipts.

## Proof

Use synthetic SQLite/Postgres/URLProtocol fixtures: multiple independent web notes, legacy import/restart dedup, duplicate text notes kept separate, native-to-web and web-to-native exact highlights, all eight colors, ambiguous repeat quotes unresolved, combining marks/emoji/UTF16 boundaries/BR/hidden content, stale deletion resurrection, highlight→note and article cascades, relationship ownership, lost ACK, newer local edits during pull, incomplete snapshots and version-1 compatibility, no synthesis outside explicit listening. Parent adds real simulator/browser tests after both implementations integrate.
