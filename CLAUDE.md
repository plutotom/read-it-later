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

### Three distinct API surfaces

1. **tRPC** (`/api/trpc`) — the internal API the web app uses. Session-authenticated via BetterAuth. Routers live in `src/server/api/routers/` (`article`, `folder`, `annotation`, `tts`, `para`, `apiKey`, `post`) and are registered in `src/server/api/root.ts`. Use `protectedProcedure` for authed routes; the session lands in `ctx.session` and the db in `ctx.db` (see `src/server/api/trpc.ts`).

2. **Public REST API** (`/api/v1/*`) — for external clients (e.g. the Raycast extension). Authenticated by **API key**, not session: `Authorization: Bearer ril_...`. Routes are thin wrappers around `defineRoute` from `src/server/lib/apiHandler.ts`, which handles key auth, scope checks, JSON error envelopes, and Zod validation. An OpenAPI spec is served at `/api/v1/openapi.json` (generated from `src/server/lib/openapiSpec.ts`).

3. **PARA sync** (`/api/para/*`) — serves a manifest + per-article `.txt` exports so an external reader (Obsidian PARA workflow) can sync. Separate auth path (`src/server/lib/paraAuth.ts`) and the `para:read` scope.

API-key scopes are defined in `src/lib/paraConstants.ts`: `ril:read`, `ril:write` (write implies read), and `para:read`. Keys are prefixed `ril_` and stored hashed (`src/server/lib/apiKey.ts`, `apiAuth.ts`).

### Auth

BetterAuth with **Discord OAuth only** — email/password is disabled (`src/server/auth.ts`). Sessions last 30 days. Page-level auth gating is done by the **`src/app/(protected)/` route group layout**, which checks the session server-side and redirects to `/login`. New authenticated pages belong under `(protected)/`.

### Services layer

Business logic lives in `src/server/services/`, and tRPC routers / REST routes stay thin by delegating to it. Notable services:

- **`articleExtractor.ts`** — fetches a URL and extracts readable content with Mozilla Readability (+ `@extractus/article-extractor`) over JSDOM. Returns fallback data on failure rather than throwing.
- **`tts.ts` / `tts-markup.ts`** — Google Cloud TTS. Splits content into ≤4000-char chunks, and for Chirp 3 HD voices converts HTML to pause-markup. Each sentence must stay under the engine's per-sentence limit (`enforceMaxSentenceLength`), and audio is stored in Vercel Blob. Voice catalog/pricing in `src/lib/tts-voices.ts`.
- **`paraExportService.ts` / `paraTextConverter.ts`** — build the PARA manifest and convert article HTML to plain `.txt`.
- **`articleService.ts`, `folderService.ts`, `annotationService.ts`, `searchService.ts`** — core CRUD/query logic.

### Database

All tables are created through `pgTableCreator` with a **`read-it-later_` prefix** (`src/server/db/schema.ts`) — the actual Postgres table for `articles` is `read-it-later_article`. Core tables: `articles`, `folders`, `highlights`, `notes`, `paraExports`, `apiKeys`, `articleAudio`. Articles carry rich metadata (excerpt, author, wordCount/readingTime, tags array, `isRead`/`isArchived`/`isFavorite` flags, and a `shareToken` nanoid for public read-only sharing at `/shared/[token]`).

### Companion projects (separate installs)

- **`mcp-server/`** — an MCP server exposing a tool to save articles into the app via its tRPC API. Has its own `package.json`/`node_modules`; build/run from inside that directory. (this is old and is likely out of date. right now the raycast extension is new and working well)
- **`raycast-extension/`** — a Raycast client built against the public REST API. Also self-contained.

These are independent — running `pnpm install` at the root does not set them up.
