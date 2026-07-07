# AGENTS.md

See `CLAUDE.md` for the authoritative architecture overview, commands, and API surfaces. (`.cursor/rules/main.mdc` is stale boilerplate that mislabels this as a "job board" — ignore it.)

## Cursor Cloud specific instructions

Services (only the web app is a real service; everything else is a library/companion):

| Service | How to run | Notes |
| --- | --- | --- |
| Next.js web app | `pnpm dev` | Serves on **port 4114** (not 3000). tRPC, REST `/api/v1`, PARA, and MCP all live inside this one process. |
| PostgreSQL 16 | `pg_ctlcluster 16 main start` (may need `sudo`) | Installed system-wide in the VM snapshot; not a Docker container here. DB `read-it-later`, user `postgres`/`password`. |

Standard lint/test/build/db commands are documented in `CLAUDE.md` and `package.json` — don't duplicate them.

Non-obvious caveats:

- **`.env` is required and gitignored.** The update script recreates it if missing (Postgres URL on `:5432` + a 32-char `BETTER_AUTH_SECRET`). Two defaults in `src/env.js` are unusable as-is: `AUTH_URL` defaults to `:3000` (wrong port) and `BETTER_AUTH_SECRET`/`AUTH_SECRET` default to a <32-char string that **better-auth rejects at runtime with a 500 on any authed page**. Both are overridden in `.env`.
- **Postgres is native, not Docker.** `start-database.sh` assumes Docker/Podman (not installed). Start the cluster with `pg_ctlcluster 16 main start` instead. After a fresh DB, run `pnpm db:push` to create the `read-it-later_`-prefixed tables.
- **Auth is Discord-OAuth-only** (email/password disabled in `src/server/auth.ts`). Without real `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`, you can boot the app and hit public routes (`/login`, `/api/v1/openapi.json`) but cannot complete a browser login. `/` correctly 307-redirects to `/login`.
- **Testing the core "save an article" flow without a browser login:** use the tRPC server-side caller (`createCallerFactory(appRouter)` from `src/server/api/trpc.ts`) with a stub session `{ user: { id } }` after seeding a row in `read-it-later_user`. `article.create` runs the real fetch → Mozilla Readability extraction → Postgres persist path. Article extraction needs outbound internet and **returns placeholder/fallback content instead of throwing** when a URL fails (e.g. 404), so verify with a valid URL.
- **Don't run `pnpm build` while `pnpm dev` is running** — both write `.next` and can corrupt each other's state; restart dev afterward.
- `SKIP_ENV_VALIDATION=true` bypasses env validation (already used by vitest via `vitest.config.ts`).

---

## Validation contract (do this before you call work "done")

An agent's change is only complete when it can prove it. Run the full gate:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
SKIP_ENV_VALIDATION=1 pnpm build
```

All must pass. This is the same gate CI runs on the PR (`.github/workflows/ci.yml`).
If any step fails, the branch is not ready — fix it, don't hand it over.

Then, for anything touching auth, data, or UI: push the branch, wait for the
**Vercel preview deployment**, and verify the preview link before sharing it (see
the preview-auth acceptance test below).

## The goal this repo is set up for

Agent makes a change → pushes a branch → CI goes green → Vercel builds a preview →
**auth works on the preview URL** → agent shares the link → human validates against
isolated preview data → merge to `main` → production.

## Preview-branch auth (Better Auth + Neon) — how it works

`src/server/auth.ts` resolves `baseURL` at runtime:

1. `AUTH_URL` if explicitly set (production custom domain).
2. else `https://$VERCEL_URL` — the unique per-preview host.
3. else `http://localhost:3000`.

It also sets `trustedOrigins` including `https://*.vercel.app` so preview hosts are
accepted. This means **you do not hardcode a preview URL** — each PR's preview
resolves its own.

### One-time infra setup (dashboard steps — an agent CANNOT do these)

These require account access and are the reason preview auth isn't 100% automatic:

1. **Neon branch per preview.** Enable Neon's Vercel/GitHub integration so each PR
   gets an isolated Postgres branch. Set `DATABASE_URL` in **Vercel → Preview** to
   the branch's pooled connection string. This keeps preview data separate from prod.
2. **Discord OAuth callback.** In the Discord Developer Portal, add the preview
   callback to the app's redirect URIs. Because preview hosts are dynamic, either:
   - use a **separate Discord app for previews** with a wildcard-friendly setup, or
   - add specific preview callback URLs as needed:
     `https://<preview-host>/api/auth/callback/discord`
3. **Vercel Preview env vars:** `AUTH_SECRET`, `DISCORD_CLIENT_ID`,
   `DISCORD_CLIENT_SECRET`, `DATABASE_URL` (the Neon branch). Do NOT set `AUTH_URL`
   for Preview — leaving it unset lets `VERCEL_URL` take over.
4. **Migrations on preview:** run `pnpm db:migrate` (not `db:push`) against the
   preview branch so schema matches before the app boots.

### Preview-auth acceptance test

On a pushed branch, confirm all of:

- [ ] Preview URL loads without a build error.
- [ ] Sign-in with Discord redirects from the **preview host**.
- [ ] The callback returns to the **preview host** (not prod/localhost).
- [ ] An authenticated request reads/writes the **preview Neon branch**, not prod.
- [ ] No production secrets are present in the preview build.

## Repo notes / gotchas

- Package manager: **pnpm** (`pnpm@9.15.1`). Never npm/yarn.
- Env is validated via `@t3-oss/env-nextjs` in `src/env.js`. Add new vars there
  (schema + `runtimeEnv`) or the build fails. Use `SKIP_ENV_VALIDATION=1` in CI.
- There are two secrets in the schema: `AUTH_SECRET` (used by `auth.ts`) and
  `BETTER_AUTH_SECRET` (currently unused by the config). Prefer `AUTH_SECRET`;
  consider removing `BETTER_AUTH_SECRET` to avoid confusion.
- Lint is `next lint` (eslintrc-compat), not flat config yet.
- DB: Drizzle + `postgres` driver; table prefix `read-it-later_`. Migrations in
  `drizzle/`; use `db:migrate`, not `db:push`, for anything shared.
- Default/base branch for PRs and CI is **`main`**.
