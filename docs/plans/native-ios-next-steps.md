# Paper Drive iOS: status and next steps

Updated: October 25, 2026.

Status: Password-first iOS authentication is ready in PR #22. The stacked `feature/ios-library-sync` branch implements article sync and the authenticated shared listening client. `feature/ios-annotation-sync` adds independent notes and safe highlight sync; validation/review is in progress. The user authorized authentication work; separate iOS Vercel provisioning, production release and a new TestFlight upload remain deferred. Existing TestFlight installs do not receive branch changes automatically.

## Current order

1. Finish authentication validation: existing Discord users enroll a password on the web, then sign in on iOS as the same account. No separate iOS users or password signup. Apple/native Discord OAuth and recovery remain later work.
2. Validate the shared canonical text, account library API and durable two-way article/flag/deletion sync now implemented on the stacked branch.
3. Validate the implemented protocol-2 durable queue, multiple notes and web-compatible highlights; preserve existing local snapshots/quotes and reject ambiguous anchors.
4. Reuse the web Google speech provider through the common authenticated listening backend. Adapt the native client to the existing stream contract; retain replaceable provider adapters. Login, catalog and sync must never generate billable speech.
5. Validate device behavior, account ownership and usage limits; review privacy disclosures, then prepare a separately authorized private TestFlight release.

The current auth branch uses an empty isolated database on the existing nonproduction Neon host for preview verification, with a separate session secret and speech disabled. It does not create the proposed iOS Vercel project or move production data. Account and library databases must be shared between web and iOS within each environment.

## What exists

- Native SwiftUI iPhone app, Safari Share Extension, and persistent local SQLite
  library with offline reading, notes, favorites, read state, and highlights.
- Paragraph-based streaming speech, mini and expanded players, scrubbing,
  speed/voice selection, sleep timer, background audio, and lock-screen controls.
- Server-side Speechify and Inworld adapters behind the same audio/timing
  contract. Speechify has been tested live; Inworld has contract tests only.
- Private backend audio reuse using Postgres metadata and Vercel Blob artifacts.
  Complete paid artifacts have no automatic server expiry.
- On-device audio cache defaults to 200 MB, supports configurable limits, and
  removes audio unused for 28 days. Storage management can clear audio or remove
  downloads while preserving saved links, notes, highlight quotes, and flags.
- Paper Drive 0.2.0 (5) is available for internal TestFlight testing. There has
  been additional native storage work since that upload; merging code does not
  update the installed TestFlight build.

## Safe integration with the web application

Native source and plans can live on main while deployment work is paused.
The native speech HTTP routes require the explicit server-side setting
`NATIVE_SPEECH_ENABLED=true`. With the setting absent or `false`, catalog,
generation, cache reads/status, and deletion return 404 before accessing speech
storage or dispatching generation. Do not enable this on the web production
deployment as part of this merge.

This switch is deployment control, not user authentication. The enabled private
prototype still has unrestricted access until the account milestone replaces it.
Provider credentials alone must not enable the routes.

Do not run production migrations, change production environment variables,
provision the proposed iOS Vercel project, or upload a new TestFlight build merely
to integrate this work. Existing web Google TTS and account behavior remain the
web application's existing implementation. A merge can still trigger the
repository's normal Vercel rebuild and CI; do not promise that no deployment runs.

## Database and deployment boundaries

Use the same repository and a separate Vercel project for the native speech
backend, proposed name `paper-drive-api-beta`, when provisioning resumes.

| Data                                                                 | Intended home                                                                           |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Accounts, articles, highlights, notes, reading state                 | One shared library/account backend and database used by web and iOS in each environment |
| Native speech artifact metadata, generation leases, deletion records | Separate speech cache Postgres database                                                 |
| Generated native audio and timing artifacts                          | Private speech Blob store                                                               |
| Offline library, queued changes, downloaded audio                    | Account-scoped storage on the iPhone after sync is implemented                          |

Beta web and beta iOS share the beta account/library environment. Production web
and production iOS share production accounts and library data. The speech cache
database is not a second iOS article library. The phone accesses shared data
through authenticated APIs, never by receiving database credentials.

## Deferred: beta speech deployment

1. Recheck main, current resources, credentials, and the app's actual TestFlight
   build before changing infrastructure. Prior PR preview resources are not a
   permanent beta deployment and must not be confused with production.
2. Create the separate beta Vercel project in `isaiah-proctors-projects` using
   this repository. Add a native-speech deployment role that exposes only its
   intended endpoints; the opt-in switch alone does not isolate all web routes.
3. Connect dedicated beta speech Postgres and private Blob storage, separate
   from production and disposable PR previews. Require explicit configuration
   rather than falling back to the web database. Preserve verified paid cache
   artifacts when moving storage.
4. Configure Speechify server-side and enable the prototype explicitly only on
   the intended test backend. Keep Inworld unconfigured until live evaluation is
   requested. The Speechify budget is small; use mocks and cached fixtures first.
5. Choose a stable HTTPS origin and deliberate deployment access suitable for
   native URLSession. TestFlight distribution does not protect the API, and
   Vercel preview protection does not automatically work from the app. Never
   embed provider credentials or a deployment-bypass secret in the phone build.
6. Configure the beta app with that origin so testers do not enter a server URL.
   Catalog loading, login, and sync must not synthesize paid audio.
7. Verify paragraph starts, cache reuse after local eviction, error handling,
   background playback, interruptions, and output routes. Prefer existing verified
   artifacts; avoid repeated paid generation for infrastructure testing.
8. Upload a new internal TestFlight build only under Apple team `3CVY7K9AJ6`,
   preserving bundle IDs, App Group, and existing local library data.

## Remaining: cross-platform sync and sign-in providers

The agreed design is in [the sign-in and sync plan](native-ios-auth-sync.md),
including Astra's review corrections. Its key product decisions are:

- Require sign-in on iOS, with Discord and Sign in with Apple on both platforms.
- Keep offline access after sign-in and retain pending changes for their original
  account after logout. Require a signed-in destination for Safari sharing.
- Automatically migrate the existing pre-account test library once; do not
  build an ongoing guest library.
- Merge changes to different fields; the last server-accepted write wins for
  competing field edits. Stale updates must not resurrect deletions.
- Define shared canonical text before article sync; preserve legacy highlights
  and reject ambiguous matches. Current web and native highlight hashes differ.
- Use one auth authority/library service per environment. Every web writer must
  participate in the same durable sync history.
- Add account ownership and durable usage/budget controls to account-connected
  speech before enabling that milestone. Keep Google and Speechify audio variants
  separate; eventually sync listening progress through text anchors.

Password sign-in and local account isolation are implemented. Article/flag/deletion sync is implemented on the stacked branch; protocol-2 annotation sync is implemented on the next stacked layer. Shared reading/listening progress remains future work.
Do not add a second set of iOS users or a separate authoritative article database.

## Verification before the next release

- Run the full repository gate in `AGENTS.md`; keep default-disabled native
  routes covered without real database, Blob, or provider access.
- Run native core tests, simulator app/extension build, and relevant UI checks.
- Test deployed changes against isolated beta resources; do not migrate or probe
  private production article data as a test fixture.
- Complete physical-device listening checks and review privacy declarations when
  accounts/data sharing change. Public release is a separate decision.

Implementation details and historical speech decisions are in
[the iOS developer guide](../../ios/README.md) and
[the original speech plan](native-ios-speech.md). Prefer the developer guide for
current behavior; the original plan describes the pre-implementation baseline.
