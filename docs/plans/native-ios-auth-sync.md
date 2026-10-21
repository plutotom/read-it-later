# Paper Drive sign-in and library sync plan

Updated: October 21, 2026.

Status: Product decisions agreed; implementation pending. This document records
the required-sign-in revision after Astra's architecture review. Creating this
plan does not implement authentication, provision infrastructure, or authorize a
production release.

Backend provisioning and implementation are currently paused. See
[iOS status and next steps](native-ios-next-steps.md) for the immediate resume point.
Native speech routes now require an explicit deployment opt-in; that switch is
separate from the future account authorization described here.

## Goal

Use one account and reading library across the native iOS app and the website.
Keep offline reading and editing on iOS. Speech providers may differ between
clients without creating separate accounts or libraries.

The next release is for private TestFlight testers. This is a future account and
sync milestone; the current native build remains a local library with a separate
speech API.

## Agreed product decisions

- Require sign-in before using the iOS library. Do not build an ongoing guest
  library or a guest-to-account selection flow.
- Offer Discord and Sign in with Apple on both web and iOS. Preserve existing
  Discord accounts.
- After an account has signed in, support offline reading and editing of its
  downloaded library. A temporary connectivity failure does not sign it out.
- Require a signed-in destination to save from the Share Extension. When signed
  out, explain that the user must open Paper Drive and sign in; do not silently
  save a guest share or assume the extension can launch the main app.
- Retain unsynced changes on logout in the original account's protected local
  partition. Upload them only when that same account next signs in.
- For concurrent changes to the same mutable field, the last accepted server
  write wins. Merge changes to different fields. Never use device clocks to
  determine the winner.
- An explicit deletion wins over a stale offline update. Restoring an article is
  an explicit operation, not a side effect of an old device reconnecting.
- Automatically import the existing pre-account test library once after the
  first successful sign-in. Preserve its articles, notes, and highlights. This
  migration is the only exception to the absence of guest libraries.
- Keep the next release private; public App Store distribution is a later gate.

## Current implementation and gaps

- Web uses Better Auth, pinned to 1.4.5 in the lockfile, with Discord OAuth only.
  Existing web sessions and user IDs remain the identity foundation.
- Web REST endpoints currently accept personal API keys. Native session
  credentials are not automatically accepted by that authentication path.
- Web articles and annotations are account-owned server records. iOS uses a
  local GRDB/SQLite library without account ownership, a mutation queue, server
  revisions, or deletion tombstones.
- The current Share Extension writes an unattributed URL to an App Group inbox.
  It needs account and environment attribution before account-based use.
- Web extracts HTML using Readability; iOS extracts plain text using SwiftSoup.
  These independently produced documents cannot safely share raw offsets.
- Web highlights use cyrb53 fingerprints; iOS uses SHA-256 over UTF-8. Existing
  anchor version numbers do not establish cross-platform compatibility.
- Web quote re-anchoring can choose the first of ambiguous matches. It must not
  be used unchanged for migrating phone highlights.
- Web has multiple notes, optionally attached to highlights. iOS currently has
  one article note. Preserve existing notes during migration; define their
  shared editing model before adding bidirectional note sync.

Relevant code: `src/server/auth.ts`, `src/server/lib/apiAuth.ts`,
`src/server/db/schema.ts`, `src/lib/highlight-anchor.ts`, and
`ios/ReadingCore/Sources/ReadingCore/{Library,Highlight}.swift`.

## Account and backend topology

Keep the same GitHub repository and shared server service code. Use one central
authentication authority and library API per environment. Both clients use that
authority's user IDs and account-owned library records.

The separate iOS Vercel project hosts native speech and any necessary native
integration routes. It does not create another account database or independently
issue competing identities. Prefer calling the central library API rather than
duplicating library authorization and database writers in the speech project.

Beta web and beta iOS use the same isolated beta identity/library environment.
Production web and production iOS use the production environment. Speech cache
Postgres and private Blob storage can remain separate from library storage.
Make deployment roles and expected environment identities explicit; missing beta
configuration must fail closed instead of falling back to production resources.

Do not copy live user content into beta. Use synthetic accounts, public test
articles, and a reviewed migration path. Resolve the documented legacy migration
0009 fresh-database issue before relying on the full web migration chain.

## Native sign-in and account linking

First prove the entire flow against the installed Better Auth version:

1. Start login through `ASWebAuthenticationSession` using the correct environment.
2. Authenticate through the central account authority with Discord or Apple.
3. Return a short-lived, single-use authorization code bound to the initiating
   request, exact callback, and PKCE verifier; validate state as applicable.
4. Exchange the code for a revocable native session and store credentials in
   Keychain. Never put provider secrets or long-lived session tokens in URLs.
5. Verify the session on every protected API operation, derive the user ID on the
   server, and enforce record ownership. Test expiration, renewal, and revocation.

Discord-to-server OAuth and server-to-native credential delivery are separate
boundaries. Do not assume securing the former secures the latter. Choose supported
Better Auth mechanisms after the proof; a generic bearer plugin alone does not
implement this complete flow. Keep existing personal API-key clients compatible.

Adding Apple must not create a duplicate account for an existing Discord user.
Provide explicit linking from an authenticated account with proof of the new
identity. Do not merge accounts solely because email addresses match, and account
for Apple's private relay addresses. Keep callback/origin allowlists scoped to
known environments rather than broadly trusting unrelated preview deployments.

## Local ownership, logout, and sharing

Partition library data, pending mutations, imports, bookmarks, inbox entries, and
audio references by environment and authoritative account ID. Attach an account
generation to in-flight work so a late response from account A cannot update
account B after switching.

On logout, stop playback and background account work, clear usable session
credentials, hide the account's library, and retain its pending work privately.
Do not convert that work into guest data or transfer it to the next account.
An expired session can retain local offline data but cannot authorize server
requests; require reauthentication for further network sync.

The Share Extension records a signed-in destination and generation in each
durable inbox entry. The server still verifies authorization when the main app
uploads it. If the account changes while saving, retain the entry for its original
account; never import it into whichever account happens to be active later. A
signed-out extension offers guidance rather than a guest save flow.

The one-time legacy import is resumable and idempotent. Back up original local
documents and annotations, bind the import to the first successfully selected
account, and persist local-to-server ID mappings before importing dependent
highlights or notes. An interrupted import must resume for that account. It must
not restart into a different account after logout.

## Shared article and highlight contract

Define the canonical document contract before implementing article sync, even if
highlight UI ships later:

- One server article ID and immutable content-version identity per saved article.
- Exact canonical reading text with documented paragraph separators, whitespace,
  HTML entity handling, and Unicode normalization.
- Explicit UTF-16 offset units and a named, versioned hash algorithm/encoding
  shared by Swift and TypeScript.
- Paragraph/block identifiers within each content version. Matching blocks
  across changed versions is a separate operation, not an assumed guarantee.
- Highlights retain the exact quote, surrounding context, offsets, content
  version, anchor format, color, and stable annotation ID.

Both readers display the same underlying canonical text. Web HTML presentation
needs a tested mapping to it. Preserve original local snapshots during import;
do not overwrite the only copy of text that existing highlights refer to.

Trust offsets only against a matching document version/hash and quote. Otherwise,
re-anchor conservatively using quote and context. An ambiguous or missing match
remains a visible unresolved annotation with its original quote. Never claim a
successful match by choosing the first repeated paragraph.

## Offline synchronization contract

- Persist each local edit and its pending mutation atomically. Send stable
  mutation IDs, entity IDs, changed fields, and base revisions. Send assignments
  such as `setFavorite(true)`, not retry-sensitive toggles.
- Apply mutations and record idempotent results atomically on the server. A retry
  returns the original result without creating another entity or changing write
  order. Reusing an ID with different input fails.
- Use server-controlled ordering for conflicts. Preserve independent field edits;
  apply the agreed last-accepted-write rule only to competing mutable fields.
  Content versions and account ownership are not generic last-write-wins fields.
- Deduplicate concurrent saves using conservative URL identity rules scoped to
  the account. Enforce the chosen identity atomically and return ID mappings so
  related annotations remain attached. Do not strip potentially meaningful URL
  parameters indiscriminately.
- Commit entity changes and a durable change journal together. Every writer must
  participate: web tRPC, REST, imports, background work, and deletion paths.
- Return account-bound opaque cursors and deletion tombstones. Ensure the feed
  cannot skip transactions that commit out of allocation order.
- Apply each downloaded page and its cursor atomically on the phone. Define a
  consistent initial snapshot plus catch-up boundary and recovery after an
  expired cursor without losing queued local changes.
- Specify supported offline duration, idempotency retention, tombstone retention,
  and recovery behavior together. Old clients must not resurrect deleted records.

A CRDT is not required for the initial article flags and highlight operations.

## Speech remains a separate concern

Web may keep Google TTS while iOS uses Speechify through interchangeable backend
adapters. Generated audio, timing, voice settings, and cache variants remain
provider-specific. Shared reading/listening progress should eventually reference
canonical text or a paragraph, not provider-specific seconds or chunk IDs.

Login, library import, sync, and catalog loading must never trigger paid speech
generation. Start synthesis only through an explicit listening action and the
player's bounded preparation of upcoming sections.

During the accounts milestone, replace prototype speech authorization with
verified account identity and ownership checks for generation, artifact reads,
and deletion. Define migration of existing prototype artifacts without making
them globally readable or unnecessarily regenerating paid audio. Cached bytes
are not authorization. Coordinate deletion/privacy rules with paid-cache reuse.

Account-connected paid speech also needs durable usage accounting and server-side
rate, concurrency, and budget enforcement. These are release gates for that
milestone, not work to defer until notes and progress are finished. This document
does not silently change the previously approved unrestricted private prototype.

## Implementation sequence

1. Finalize topology, ownership boundaries, canonical text format, sync semantics,
   and legacy import; establish isolated beta configuration and migrations.
2. Prove Discord/Apple login, account linking, native API authentication,
   revocation, local partitioning, logout, and account switching.
3. Implement the common mutation/change-journal service and integrate all web
   writers. Harden server article fetching before exposing native URL ingestion.
4. Ship account-owned article/state sync, signed-in sharing, and the resumable
   one-time import while preserving original document snapshots and annotations.
5. Ship canonical reader mapping and highlight synchronization/migration with
   shared Swift/TypeScript fixtures.
6. Add the agreed note model and text-anchored reading/listening progress.

Integrate account-based speech authorization and usage controls before enabling
paid speech for the account-connected build. Review privacy disclosures, account
deletion behavior, and public release requirements before public distribution.

## Acceptance and release checks

- Account A's edits, shared links, responses, and downloads never enter B's
  library, including while switching accounts with work in flight.
- Returning to A preserves its unsynced edits; a revoked session cannot authorize
  library or speech operations beyond the documented revocation bound.
- Offline reading works after a prior sign-in. Reconnecting uploads only the
  active account's work.
- Retried requests, lost responses, concurrent duplicate saves, and skewed device
  clocks converge without duplicate records or detached annotations.
- Independent field edits survive; competing edits obey server acceptance order;
  deletion wins over stale updates.
- Interrupted imports, sync page application, and cursor expiry recover without
  losing pending work or reassigning account ownership.
- Shared Unicode fixtures cover combining marks, emoji/ZWJ sequences, nonbreaking
  spaces, CRLF, HTML block boundaries, and repeated quotes. Hashes and UTF-16
  ranges agree exactly; ambiguous anchors remain unresolved.
- Existing Discord users can add Apple without losing their library or creating
  unintended duplicate accounts. Native credentials work with the intended API;
  existing API-key clients retain their supported behavior.
- Beta credentials and cursors cannot access production resources, or vice versa.
- Sync does not synthesize audio. Provider changes preserve text-based position
  without treating incompatible cached audio as interchangeable.
- Run the full `AGENTS.md` repository gate, native core/build/UI checks, isolated
  deployed auth/data acceptance tests, and physical-device offline/share tests
  before calling the implementation ready.

## Return point: dedicated iOS speech backend

The immediate backend work is separate from implementing this account plan:

1. Create the proposed `paper-drive-api-beta` Vercel project in
   `isaiah-proctors-projects`, linked to this same repository, with independent
   releases and a stable HTTPS origin for TestFlight.
2. Implement an explicit native-speech deployment role so deploying the same
   Next.js repository does not accidentally expose unrelated web APIs or
   maintenance operations. Make required beta storage configuration fail closed.
3. Connect dedicated beta speech Postgres and private Blob storage. Keep them
   separate from production and disposable PR previews. Apply the speech-only
   migration path; preserve completed paid artifacts during moves.
4. Configure the existing Speechify credential privately on the server. Keep
   Inworld unconfigured until live evaluation is requested. Never place provider
   credentials or Vercel deployment-bypass secrets in the app.
5. Configure beta deployment access deliberately. Vercel preview protection and
   TestFlight distribution are not application authentication; the current
   prototype access policy remains unrestricted until explicitly replaced.
6. Configure the iOS beta build with the stable server origin so ordinary testers
   do not enter a server URL. Keep silent/test adapters available for development.
7. Verify deployed streaming and backend/local cache reuse using synthetic or
   existing verified fixtures first. Respect the small Speechify budget and
   avoid repeating paid generation merely to test infrastructure.
8. Upload the next internal TestFlight build only under Apple team
   `3CVY7K9AJ6`, retaining the existing bundle IDs and local library.

Existing speech implementation and cache rules are documented in
[the native speech plan](native-ios-speech.md) and
[the iOS developer guide](../../ios/README.md). The phone cache remains 200 MB
with 28-day inactivity cleanup; completed backend audio has separate retention
and should normally be reused after a phone eviction.

## Design references

- [OAuth for native apps (RFC 8252)](https://www.rfc-editor.org/rfc/rfc8252.html).
- [Better Auth bearer authentication](https://better-auth.com/docs/plugins/bearer)
  (verify compatibility with the installed version before implementation).
- [W3C Web Annotation selectors](https://www.w3.org/TR/annotation-model/#selectors).
- [Vercel projects in one repository](https://vercel.com/docs/monorepos).
- [Vercel streaming functions](https://vercel.com/docs/functions/streaming-functions).
- [Vercel Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk).
