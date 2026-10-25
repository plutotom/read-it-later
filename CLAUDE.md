# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A self-hosted "read it later" app (T3 stack): save article URLs, extract clean readable content, organize into folders, highlight/annotate, listen via text-to-speech, and sync to external clients. The `.cursor/rules/main.mdc` file mislabels this as a "job board" — ignore that; it's stale boilerplate.

## Commands

Package manager is **pnpm**. The dev server runs on **port 4114** (not 3000, despite the README).

```bash
pnpm dev              # start dev server (Next.js, turbo) on :4114
pnpm check            # lint + typecheck — run this before considering work done
pnpm typecheck        # tsc --noEmit only
pnpm lint             # next lint (pnpm lint:fix to autofix)
pnpm test             # vitest run (all tests)
pnpm test:watch       # vitest watch mode
pnpm format:write     # prettier write
```

Run a single test file or test by name:

```bash
npx vitest run src/server/services/tts.test.ts
npx vitest run -t "preserves total character count"
```

Tests use the `node` environment with `SKIP_ENV_VALIDATION=true` (see `vitest.config.ts`), so they run without a real DB or env. Test files are colocated as `*.test.ts` next to the code they cover. The `~/` import alias maps to `src/`.

Database (Drizzle + Postgres):

```bash
pnpm db:push          # push schema directly (dev)
pnpm db:generate      # generate a migration from schema changes
pnpm db:migrate       # apply migrations
pnpm db:studio        # Drizzle Studio
```

## Architecture

**Stack:** Next.js 15 (App Router, RSC) · tRPC v11 · Drizzle ORM (Postgres via `postgres` driver) · BetterAuth · Tailwind v4 + shadcn/ui · TipTap editor · nanostores for client state.

### API surfaces

1. **tRPC** (`/api/trpc`) — the internal API the web app uses. Session-authenticated via BetterAuth. Routers live in `src/server/api/routers/` (`article`, `folder`, `annotation`, `tts`, `para`, `apiKey`, `post`) and are registered in `src/server/api/root.ts`. Use `protectedProcedure` for authed routes; the session lands in `ctx.session` and the db in `ctx.db` (see `src/server/api/trpc.ts`).

2. **Public REST API** (`/api/v1/*`) — for external clients (e.g. the Raycast extension). Authenticated by **API key**, not session: `Authorization: Bearer ril_...`. Routes are thin wrappers around `defineRoute` from `src/server/lib/apiHandler.ts`, which handles key auth, scope checks, JSON error envelopes, and Zod validation. An OpenAPI spec is served at `/api/v1/openapi.json` (generated from `src/server/lib/openapiSpec.ts`).

3. **PARA sync** (`/api/para/*`) — serves a manifest + per-article `.txt` exports so an external reader (Obsidian PARA workflow) can sync. Separate auth path (`src/server/lib/paraAuth.ts`) and the `para:read` scope.

4. **Hosted MCP** (`/api/mcp`) — Streamable HTTP MCP endpoint (`src/app/api/[transport]/route.ts` with mcp-handler `basePath: "/api"`, so the endpoint resolves to `/api/mcp`) so MCP clients (Cursor, Claude Desktop) connect to a URL instead of running the local stdio server. Per-request `Authorization: Bearer ril_...`, same keys as the REST API. Tool registration is shared with the stdio server via `@read-it-later/core/mcp` (`registerTools`), which calls `/api/v1` through the core client — so it's another front door to the same logic, not a new code path. Stateless (no Redis); `add_article` URL extraction needs `maxDuration`/Fluid Compute on Vercel Pro.

API-key scopes are defined in `src/lib/paraConstants.ts`: `ril:read`, `ril:write` (write implies read), and `para:read`. Keys are prefixed `ril_` and stored hashed (`src/server/lib/apiKey.ts`, `apiAuth.ts`).

### Auth

BetterAuth with Discord OAuth and password sign-in for existing accounts (`src/server/auth.ts`). Password signup is disabled: sign in with Discord, then open `/native/password` (also linked in Preferences) to enroll a 12–128 character password after a fresh sign-in. Changing an existing password requires the current password and revokes other sessions. There is no email recovery flow yet. `AUTH_SECRET` must have at least 32 characters. Sessions last 30 days.

Native clients use Better Auth's **signed** `set-auth-token` response header as Bearer credentials, never the raw JSON token. `GET /api/native/auth/session` validates against the session store and returns only account identity and expiry; native logout revokes its own session. Browser cookies and native Bearer sessions share the same user IDs. `/api/v1` personal API keys remain a separate authentication path. Password attempts use atomic per-minute counters in the existing verification table (5 per email, 30 per trusted client IP); password setup requires a trusted Origin, fresh session, and a separate limit. Preview auth resolves its own deployment host and trusts exact configured origins; never test against production data or inherit production secrets. Page-level auth gating is done by the **`src/app/(protected)/` route group layout**, which checks the session server-side and redirects to `/login`. New authenticated pages belong under `(protected)/`.

### Native account library

`/api/native/library` and `/api/native/library/mutations` accept verified signed Better Auth Bearer sessions, never personal API keys or cookie-only authentication. They share the web account/article database. Migration 0015 captures all article writers through transaction-held owner revisions and a compact current-state ledger with permanent tombstones; mutations have durable owner-scoped receipts and aliases. Apply 0016 for annotation ownership checks and 0017 for independent annotation identities and all-writer delivery. No native sync request fetches publisher URLs or generates audio; new native articles upload safely escaped on-device extracted text. Payloads and per-account request rates are bounded.

Canonical `paper-drive-text-v1` text comes from the shared listening parser's normalized paragraphs before segment splitting, with SHA-256 over exact UTF-8 and UTF-16 offsets. `/api/native/listening/document?articleId=...` exports that text and existing web segment identities, without synthesis. The native authenticated adapter calls the existing `/api/listening/catalog` and `/api/listening/stream`, retaining Google providers, durable cache/usage limits and unchanged synthesis identities. `WEB_SPEECH_ENABLED` still controls generation.

Native SQLite owns the durable outbox, cursor, server/local mappings and preserved text versions. Protocol 2 additionally syncs independent notes and all eight highlight colors. Source anchors remain immutable; canonical and DOM placements are verified projections, and ambiguous saved quotes remain unresolved. Complete annotation snapshots replace base state; unavailable snapshots never imply deletion. Legacy inline notes import once using persisted identities. Recovery export format 4 retains original quotes and text versions. Contracts are in `docs/plans/native-ios-sync-contract.md` and `docs/plans/native-ios-annotation-contract.md`. Tests require isolated local `NATIVE_LIBRARY_TEST_DATABASE_URL` and `ANNOTATION_TEST_DATABASE_URL`; never point these at production. Public native account sync does not use the separately deferred speech-only Vercel project.

### Services layer

Business logic lives in `src/server/services/`, and tRPC routers / REST routes stay thin by delegating to it. Notable services:

- **`articleExtractor.ts`** — fetches a URL and extracts readable content with Mozilla Readability (+ `@extractus/article-extractor`) over JSDOM. Returns fallback data on failure rather than throwing.
- **`tts.ts` / `tts-markup.ts`** — Google Cloud TTS. Splits content into ≤4000-char chunks, and for Chirp 3 HD voices converts HTML to pause-markup. Each sentence must stay under the engine's per-sentence limit (`enforceMaxSentenceLength`), and audio is stored in Vercel Blob. Voice catalog/pricing in `src/lib/tts-voices.ts`.
- **Web listening** — `src/lib/listening/` contains the shared DOM/text model, validated stream protocol, injectable playback controller, HTTP source, and browser audio transport. The audio worklet in `public/listening/pcm-worklet.js` reports a render cursor that stops on pause and underrun. SoundTouch preserves pitch at different playback speeds; its processor is copied on install. React subscribes to the controller without rebuilding article HTML. Selection actions start at a paragraph boundary; CSS highlights share the existing annotation stylesheet.
- **Reader / Web view** — saved web articles offer a **Switch to Web view / Switch to Reader view** action in the reader’s ellipsis menu. Web mounts the original URL on demand in a sandboxed iframe; returning to Reader removes it and restores the reader's scroll position. Reader audio pauses on entry, and reader-only controls are hidden. An animated, dismissible tip explains embedding limits on the first switch to Web for each article per tab session (`sessionStorage`, with an in-reader fallback when storage is blocked). It closes after seven seconds, pausing while hovered or focused; repeated toggles and reloads stay quiet. Only HTTP(S) URLs without embedded credentials are accepted; PDFs keep their existing viewer. The frame allows scripts, forms, and popups but deliberately omits `allow-same-origin` and top navigation so an embedded page (including redirects) cannot access the app. Publisher embedding policies, sign-in/storage requirements, CORS, and mixed content can prevent full rendering. A persistent **Open original** link is the fallback; iframe `load` does not prove successful rendering. No proxy bypasses publisher restrictions.
- **`services/listening/`** — authenticated `/api/listening/catalog` and `/api/listening/stream` routes resolve segments from an owned, saved article and reject stale content revisions. Google Chirp 3 HD streams 24 kHz PCM by default with paragraph highlighting. Configured Speechify/Inworld adapters expose word timing capabilities through the same provider interface. Add providers in `providers.ts`, normalize them to `ProviderEvent`, and bump the model/output version when synthesis settings change; keep provider selection outside the controller and UI.
- **`paraExportService.ts` / `paraTextConverter.ts`** — build the PARA manifest and convert article HTML to plain `.txt`.
- **`articleService.ts`, `folderService.ts`, `annotationService.ts`, `searchService.ts`** — core CRUD/query logic.

### Database

Web streaming is opt-in with `WEB_SPEECH_ENABLED=true`; the existing recording player remains the fallback when disabled, for PDFs, and on public shares. Apply migration `0013_web_listening_usage.sql` to the web database before enabling it. Streaming reuses the private speech store (`NATIVE_SPEECH_BLOB_TOKEN` or `NATIVE_SPEECH_BLOB_STORE_ID`) and the speech database/cache established by migration 0012. Web cache IDs begin with `w` and include owner and synthesis identity, keeping them outside the prototype's hex-only cache API. Generation leases prevent duplicate billable work; a disconnected listener does not discard an admitted generation. Complete artifacts include PCM and timing data. In-memory playback cache is capped at 16 MB with two segments of lookahead.

`WEB_SPEECH_MONTHLY_CHARACTER_LIMIT` defaults to 500,000 admitted characters per account; admission also caps 40 new segments per minute. Reservations remain charged against these application limits after provider errors because upstream usage may already be billable. Streaming and legacy recording retain their separate application allowances. Migration 0014 adds the authenticated web usage ledger and unified cost reporting (see `docs/audio-usage.md`). Claims and reservations commit before physical provider calls; each legacy chunk has its own attempt, rates are snapshotted, and ambiguous failures cannot automatically dispatch another call. Users see their own estimates; aggregate reporting requires the server-only `AUDIO_USAGE_ADMIN_IDS` allowlist. Neither user allowances nor historical voice weights are USD prices. Existing caches remain readable through the legacy identity fallback; new keys scope environment and provider account. Private speech and legacy MP3 deletion is disabled until store-wide ownership can be proven; maintenance only reports retained orphan records. Apply 0014 before deploying this branch; no production schema changes are performed by setup. Logs named `web_listening` report request ID, provider, first audio latency, completion, cache persistence and error codes without logging article text. Browser bookmarks contain only revision, voice, segment, position and rate. The new player currently streams online and caches on the server; existing recording downloads and public sharing keep the legacy path.

Rollout does not rewrite existing articles, annotations, or generated MP3 records. Streaming bookmarks use a separate browser key (`ril-listening:<articleId>`); legacy whole-file timestamps (`tts-progress-<articleId>` and `article_audio.currentTimeSeconds`) are preserved but cannot be mapped accurately to newly synthesized segments and are not imported. A first streaming session starts at the beginning or the paragraph selected by the reader. Disabling streaming returns to the existing recording player and its saved progress.

Focused tests: `pnpm exec vitest run src/lib/listening src/server/services/listening`. Set `LISTENING_TEST_DATABASE_URL` to an **isolated local** Postgres database to run concurrent admission and upgrade tests; never use production or preview data for these tests. The upgrade test baselines a representative legacy fixture through migration 0012, applies 0013 with the real Drizzle migrator, verifies saved content/audio/progress/annotation records are unchanged, and verifies a second migration run is a no-op.

All tables are created through `pgTableCreator` with a **`read-it-later_` prefix** (`src/server/db/schema.ts`) — the actual Postgres table for `articles` is `read-it-later_article`. Core tables: `articles`, `folders`, `highlights`, `notes`, `paraExports`, `apiKeys`, `articleAudio`. Articles carry rich metadata (excerpt, author, wordCount/readingTime, tags array, `isRead`/`isArchived`/`isFavorite` flags, and a `shareToken` nanoid for public read-only sharing at `/shared/[token]`).

### Companion projects (separate installs)

- **`mcp-server/`** — the **stdio** MCP server (local `node` process). Thin: it calls `registerTools` from `@read-it-later/core/mcp`, the same tools the hosted `/api/mcp` route serves. Part of the root pnpm workspace (`pnpm-workspace.yaml`), but build the shared `@read-it-later/core` package first. Prefer the hosted `/api/mcp` endpoint for most clients; the stdio server is for offline/local-dev use.
- **`raycast-extension/`** — a Raycast client built against the public REST API. Also self-contained.

These are independent — running `pnpm install` at the root does not set them up.
