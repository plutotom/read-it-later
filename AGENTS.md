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
