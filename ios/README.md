# Paper Drive — native 0.2 developer preview

This is a **native reader with streaming speech support**. The phone keeps an offline copy of the shared account library. Sign-in, sync and authenticated Google listening use the existing web backend. Public release remains a later milestone.

Testing checklist: [iOS beta test guide](../docs/ios-beta-testing.md).

The separate native speech deployment is still deferred. See [iOS status and next steps](../docs/plans/native-ios-next-steps.md)
for the resume checklist and [the sign-in/sync plan](../docs/plans/native-ios-auth-sync.md)
for the agreed required-account design. Native speech HTTP routes are disabled by default
on shared web deployments; private testing must explicitly set `NATIVE_SPEECH_ENABLED=true`.

## Account sign-in (development branch)

1. Sign into the website with the existing Discord account.
2. Open **Preferences → iPhone password** or `/native/password` and add a password (12–128 characters). A sign-in within the last ten minutes is required.
3. Use that account’s email and password on the iPhone. Password sign-in also works on the web; public password signup and email recovery are not enabled.

The auth origin comes from `AUTH_SERVER_URL` in `project.yml` (default `https://ril.plutotom.com`). The backend must deploy this branch before that origin supports password login. Debug builds expose a test-server field; only localhost can use HTTP. Release builds require HTTPS. No provider key or shared app password belongs in the phone.

Sessions are stored in this device’s Keychain. A previously verified, unexpired session permits offline reading; foreground checks detect revocation. Logout locks immediately and retries server revocation when online. Text, annotations, bookmarks, listening settings and cached audio are partitioned by account **and backend origin**. They remain on the phone after logout for that account’s next sign-in. Audio limits apply to each account’s cache (200 MB default). The first signed-in account receives a backup of the legacy local library once, preserving IDs, notes and highlights; the original database is retained. A later account cannot import it.

Safari sharing requires a current signed-in destination. The extension receives only an opaque account/environment namespace and expiry, never a token. Its pending links stay with that destination. After sign-in, articles and read/favorite/archive flags sync through the account library API. Notes and highlights sync through protocol 2; unresolved saved quotes remain readable without guessing a new position. Apple sign-in and native Discord OAuth remain future work.

## Shared library (development branch)

The matching backend release and migrations 0015/0016/0017 are required. The iOS app pulls web articles and readable text, queues offline saves/read/favorite/archive changes and deletions, and retries after a restart or temporary outage. Safari shares enter the same durable queue. Deleting a synced article deletes it from the account; removing downloaded text only changes this device’s storage. Repeated saves deduplicate conservatively without erasing existing web content or annotations. Existing duplicate web URLs retain distinct server identities.

Settings shows pending changes, last successful sync, errors and **Sync now**. Oversized content does not block the rest of the library: unsupported remote text keeps a link/flags record, and oversized local uploads remain recoverable until removed or reduced. Stale edits cannot resurrect deleted IDs. Original local text and annotation quotes survive canonical text replacement; **Reading options → Saved text versions** exposes preserved versions. These recovery snapshots and queued uploads remain when clearing ordinary downloads.

The player can use the same authenticated Google listening API as the web. Account voices load without provider keys on the phone; synthesis starts only after Listen or Play from paragraph. A server manifest supplies exact segments, so changing providers retains the player controls. Complete audio and saved manifests can replay offline within the signed-in account’s session lifetime. Google currently provides paragraph timing rather than word timing. Live voice/provider quality still needs a separately authorized test against the configured backend; development tests use synthetic PCM.

## Included

- Native iPhone SwiftUI app (iOS 17+, Swift 6 / Xcode 16+).
- Persistent GRDB/SQLite library. Saves URL before attempting download.
- Direct on-device HTML-to-text extraction using SwiftSoup (no publisher scripts).
- Offline text reading, search, favorites, read/unread, article-level notes.
- Local text highlights: select text → Highlight; open Highlights to change color or remove.
- Safari Share Extension: durable App Group inbox; main app imports and downloads.
- JSON export, explicit download failures and manual retries.
- Streaming Speechify/Inworld adapters, paragraph playback, mini/full-screen player, speed/voice controls, scrubbing, sleep, background audio, and lock-screen controls.
- Persistent audio cache: configurable on-device limit (200 MB by default), 28-day inactivity cleanup, and durable private backend reuse. Silent mode remains available for testing.
- Core tests and macOS CI build of the app and extension.

## Deliberately not included

Annotation sync, full HTML/images, web highlight synchronization, reading-position sync,
folders, PDFs, widgets, background download guarantees, and JSON re-import. Text extraction is a
simple heuristic, not Mozilla Readability, and may retain boilerplate or fail on
JavaScript-heavy/login-required pages. HTTP sites may be blocked by App Transport
Security; use HTTPS. The only ATS exception is localhost for simulator development; release speech-server validation still requires HTTPS.

## Run on your iPhone

1. On a Mac, install Xcode 16 or newer and its iOS SDK; open Xcode once.
2. Check out `feature/native-ios-rebuild` and install XcodeGen (`brew install xcodegen`).
3. From `ios`, run `xcodegen generate` and open `ReadItLater.xcodeproj`.
4. Sign into Xcode's Settings → Accounts with the Apple account that has access to
   **isaiah proctor — 3CVY7K9AJ6**. Both targets are pinned to this team in `project.yml`.
5. The registered bundle IDs are `com.isaiahproctor.readitlater` and
   `com.isaiahproctor.readitlater.share`. Keep them unchanged when updating this app.
6. Register/enable the **same** App Group for both targets:
   `group.com.isaiahproctor.readitlater` (or your replacement). App Group support
   requires appropriate Apple Developer provisioning. There is no silent fallback
   to a different storage location if the group is misconfigured.
7. Select the ReadItLater scheme, your connected iPhone, and Run.
8. In Safari, open Share → More and enable Read It Later.

To run on the simulator, select an installed iPhone simulator instead. A successful
GitHub `iOS preview` workflow provides an ad-hoc-signed **simulator-only** app artifact;
it is not an IPA and cannot be installed directly on an iPhone.

No signing certificates, provisioning profiles, or App Store credentials are in
this repository. Automatic signing uses the account signed into Xcode.

## Internal TestFlight

The [Paper Drive app record](https://appstoreconnect.apple.com/apps/6823970694/distribution/info)
belongs only to **isaiah proctor — 3CVY7K9AJ6**. The main app and extension are assigned
to `group.com.isaiahproctor.readitlater`. Display names use Paper Drive; bundle IDs,
App Group, and on-device storage remain unchanged so existing libraries survive updates.

### Automated upload (GitHub Actions)

`.github/workflows/testflight.yml` archives on a `macos-26` runner and uploads with
`ios/ExportOptions-TestFlight.plist` (`destination: upload`, internal-testing-only).
You do not need to archive from Xcode on a Mac for internal TestFlight.

**Triggers**

- Push to `main` that touches `ios/**` or the workflow file.
- **Actions → TestFlight → Run workflow** (`workflow_dispatch`) on any branch.

A single `testflight-upload` concurrency group queues overlapping runs and does not
cancel an upload already in progress.

**What the job does**

1. Fails immediately if the App Store Connect API secrets below are missing.
2. Selects Xcode 26.6 (or the newest installed 26.x). App Store Connect has required
   Xcode 26+ / the iOS 26 SDK since 2026-04-28.
3. Runs `swift test` in `ios/ReadingCore` and stops if tests fail.
4. Generates `ReadItLater.xcodeproj` from `project.yml` with XcodeGen.
5. Archives an unsigned device build. Marketing version stays `MARKETING_VERSION`
   in `project.yml` (currently 0.2.0). The build number is
   `TESTFLIGHT_BUILD_OFFSET + github.run_number` (offset **8**, the last committed
   `CURRENT_PROJECT_VERSION`), passed only to `xcodebuild` — nothing is committed
   back. First workflow run is build 9.
6. Cloud-signs the app and Share Extension at export with the API key
   (`-allowProvisioningUpdates` plus `-authenticationKeyPath` / `-authenticationKeyID`
   / `-authenticationKeyIssuerID`) and uploads. The `.p8` is written under
   `$RUNNER_TEMP` and deleted; secrets are never echoed.

Archive is unsigned on purpose: automatic signing at archive time would mint a new
Apple Development certificate on every ephemeral runner (team cert cap) and needs a
registered device for a development profile. Distribution profiles created at export
do not. Xcode 13+ cloud-managed Apple Distribution certificates handle signing, so
this workflow does **not** import a `.p12` or provisioning profiles.

If a later manual Xcode upload uses a higher build number, raise
`TESTFLIGHT_BUILD_OFFSET` in the workflow so CI stays above it. Do not bump
`CURRENT_PROJECT_VERSION` in `project.yml` for CI uploads.

**Secrets** (repository **Settings → Secrets and variables → Actions**). Add these
yourself; the workflow only references the names:

| Secret | Value |
| --- | --- |
| `ASC_KEY_ID` | Key ID shown next to the API key |
| `ASC_ISSUER_ID` | Issuer ID at the top of the App Store Connect API page |
| `ASC_KEY_P8` | Contents of the downloaded `AuthKey_*.p8` (PEM), or that file base64-encoded |

**Create the API key**

1. App Store Connect → **Users and Access → Integrations → App Store Connect API**.
2. Generate a **team** key. Apple documents **App Manager** as enough to upload
   builds. Cloud-managed distribution signing (no local certificate) often requires
   **Admin**; if export fails with a cloud signing permission error, recreate the
   key as Admin (or grant the key access to cloud-managed distribution certificates).
3. Download the `.p8` when it is shown — Apple will not show it again.
4. Paste Key ID, Issuer ID, and the `.p8` (or `base64 < AuthKey_….p8`) into the
   three GitHub secrets above.

The key is scoped to team **3CVY7K9AJ6** and app record **6823970694**. After
processing, answer export-compliance questions in App Store Connect if prompted,
add the build to an internal testing group, and install it from TestFlight.

These builds cannot later be used for external testing or App Store release;
create another build with the appropriate export setting for those milestones.

### Manual archive from Xcode (fallback)

1. Sign into Xcode → Settings → Accounts using the account for that team.
2. Generate/open the project as above. Select the ReadItLater scheme and **Any iOS Device**.
3. Choose **Product → Archive**, then **Distribute App → App Store Connect** in Organizer.
4. After processing, resolve the build's export-compliance questions in App Store Connect.
5. Add the build to an internal testing group and install it through TestFlight.

Use an Xcode/SDK release currently accepted by App Store Connect. If you upload
manually, pick a `CURRENT_PROJECT_VERSION` higher than the last CI build and raise
`TESTFLIGHT_BUILD_OFFSET` so the next Actions run does not collide.

Equivalent commands from the repository root (no credentials in command arguments):

```sh
xcodegen generate --spec ios/project.yml
xcodebuild -project ios/ReadItLater.xcodeproj -scheme ReadItLater \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath /private/tmp/PaperDrive.xcarchive -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath /private/tmp/PaperDrive.xcarchive \
  -exportOptionsPlist ios/ExportOptions-TestFlight.plist \
  -exportPath /private/tmp/PaperDrive-export -allowProvisioningUpdates
```

The supplied export settings pin the same team and upload an **internal-testing-only**
build.

The beta icon reuses `public/favicon.svg`, rendered as an opaque 1024px asset; it is
temporary artwork pending Paper Drive's own icon. Main-app privacy declarations cover
app-only UserDefaults (settings/bookmarks) and user content sent for speech functionality,
without tracking; authentication identity is declared as account-linked. The extension saves links locally and makes no
network requests. Review App Store Connect privacy disclosures before distributing this account-enabled build; the manifest is separate from App Store Connect's privacy questionnaire.

Live listening requires a reachable HTTPS speech server. The app starts in silent
preview until one is configured. An iPhone cannot use the simulator's localhost server,
and native requests cannot pass the current Vercel preview protection automatically.
Configure beta backend access separately; never place provider keys or a deployment
bypass secret in the app. The reader requires an initial account sign-in, but does not require the speech server.

## Test checklist

The automated simulator suite covers public HTTPS downloads, Safari sharing,
invalid-link draft recovery, duplicate saves, and notes/read state/favorites/highlights
surviving app restarts. It also checks highlight color changes and removal. The
checklist below still needs physical-device validation before distribution.

- [ ] First launch without an account presents sign-in; wrong credentials show a recoverable error.
- [ ] Paste a public HTTPS article; URL survives a failed download.
- [ ] Download text, enable airplane mode, force quit, reopen, and read it.
- [ ] Favorite/mark read; save a note; restart and verify each survives.
- [ ] Long-press article text, adjust selection, choose Highlight; reopen the article and verify its color remains.
- [ ] Open Highlights, change color, remove a highlight; check both list and reader update.
- [ ] Search title, URL, body text, and notes.
- [ ] Share from Safari while the app is closed; open the app and see the link.
- [ ] Share the same URL twice; confirm one article and no erased notes.
- [ ] Share while signed out and verify guidance to open the app and sign in.
- [ ] Try a PDF/404/login-required page; see an honest error and retry option.
- [ ] Export JSON to Files and inspect the saved content/notes.
- [ ] Test VoiceOver, large Dynamic Type, dark mode, and offline launch.

## Engineering checks

```sh
cd ios/ReadingCore
swift test
cd ..
xcodegen generate
xcodebuild -project ReadItLater.xcodeproj -scheme ReadItLater \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- build
```

Project and entitlement files are generated from `project.yml`. Do not maintain
manual changes only in a generated project; they will disappear on regeneration.
Simulator builds use ad-hoc signing (no Apple Developer team is required) so the
app and Share Extension retain their App Group entitlements. Disabling signing
produces a build that cannot use the shared inbox on the simulator.

## Manage storage

Open **Settings → Manage storage** for current cached audio usage, downloaded text
usage, and a cache limit of 50 MB, 100 MB, 200 MB (default), 500 MB, 1 GB, or Unlimited.
The chosen limit persists on this iPhone. Lowering it immediately evicts the least
recently used audio; automatic eviction never removes downloaded article text.
Unlimited still respects the 28-day inactivity cleanup and available device space.

**Clear cache** stops playback and removes local audio, preserving offline text.
**Remove all cached files & downloads** requires confirmation and removes audio
and extracted text. Saved links, titles, notes, read/favorite state, and highlight
quotes remain local. Removed text stays removed across relaunches; use **Download
text** in an article to restore it. Quotes remain visible in Highlights and can be
painted again if the same text is downloaded. Neither action deletes backend audio.
Usage reports encoded audio files and UTF-8 article text, excluding database and
index overhead. The additive `v3-download-storage` migration preserves existing
content and annotations.

## Data and security boundaries

The main app alone owns its database in Application Support. The Share Extension
writes one atomic JSON inbox file per URL in the App Group; files are deleted only
after successful database import. It never downloads or opens arbitrary HTML.
SQLite remains schema-versioned; never reset a user's database on a migration error.
Downloads use an ephemeral URLSession without cookies/credentials, byte/time limits,
and basic URL/redirect checks. These are client safeguards, **not** a complete DNS
rebinding/SSRF defense suitable for a backend endpoint. No guest extraction endpoint
has been enabled. Existing backend extraction security findings remain unresolved
and must be addressed before the server-based guest/sync milestones.

Only extracted plain text is displayed. Notes are explicitly saved or cancelled;
unsaved editor drafts are not durable. The JSON export is a recovery artifact,
not cloud sync; re-import remains pending. Device uninstall/data loss can remove
local content. No analytics is added. Original websites see normal download requests.

## Next milestones

1. Review the article-sync build against isolated fixtures; then validate physical-device behavior.
2. Validate protocol-2 notes and highlight round trips against isolated fixtures.
3. Add rich reader assets and shared reading/listening progress.
4. Add Apple/native Discord sign-in, account recovery and deletion.
5. Finish release accessibility/privacy/icon/signing work; then TestFlight.
6. Validate live voices, latency, sleep, interruptions, and output routes on physical hardware.

## Notes and highlight sync

Additive SQLite migrations preserve existing highlights and imports each legacy inline
note once into an independent note with a stable identity. The reader can add,
edit and delete multiple notes and preserves all eight web highlight colors.
Local edits and their durable queued operations commit together.

Protocol 2 keeps each highlight’s original quote, UTF-16 selector and hash.
Verified canonical and web placements are separate projections; ambiguous or
changed text leaves a recoverable quote in **Highlights** instead of guessing.
Remote sync refreshes an open reader. Oversized annotation collections report a
limit and retain existing local records. Removing downloaded text preserves notes,
quotes and recovery versions.

JSON export format 4 includes independent notes, source selectors, verified
placements and recovery records. It contains no session credentials or mutation
receipts. Re-import remains a future feature.

## Streaming listening (0.2)

The approved [native speech plan](../docs/plans/native-ios-speech.md) includes Astra’s review decisions.
Open a downloaded article, choose **Listen**, or tap a paragraph and choose **Play from paragraph**.
The mini player expands to a full-screen controller. Scrubbing/skip resume playback; changing
voices preserves the section and approximate position, including pause state. Timing for
unprepared sections is estimated and refines as audio arrives. Initial voices are English.

The app starts in silent preview until a speech server is configured. For local simulator testing, start `pnpm dev` and connect to `http://localhost:4114` in a Debug build; remote and Release connections require HTTPS. In **Settings → Listening**,
enter its HTTPS origin and tap **Connect speech server**. The curated catalog includes Geffen, Alicia, Alfonso, and Beth for Speechify, plus Dennis, Ashley, and Craig when Inworld is configured. The returned catalog pins exact
provider/model/voice settings; voice names include the provider. Saved catalog settings and
complete audio work offline after restart. A protected Vercel preview needs authorized access;
`vercel curl` can verify it, but native URLSession does not inherit the CLI’s preview bypass.
Do not disable protection as a substitute for the planned public-release account work.

### Backend setup

Use Node 22 and pnpm 9.15.1. Provider credentials stay server-side. Configure:

- `NATIVE_SPEECH_ENABLED=true` explicitly enables native catalog, streaming, and cache
  endpoints on the intended private test server. Leave it unset or `false` on the web
  production deployment; disabled endpoints return 404 before speech storage/generation.
- `SPEECHIFY_API_KEY` and/or `INWORLD_API_KEY` (Inworld’s supplied Basic credential, unchanged).
- `NATIVE_SPEECH_PROVIDER=speechify` or `inworld` determines the first catalog voice for new connections.
- `NATIVE_SPEECH_DATABASE_URL`: isolated speech Postgres connection. Without it the service uses
  `DATABASE_URL`; preview/development are provisioned with their own speech database.
- `NATIVE_SPEECH_BLOB_STORE_ID`: **private** Blob store connected to the project using OIDC.
  Alternatively use `NATIVE_SPEECH_BLOB_TOKEN` for a dedicated private store. Never point speech
  at the web app’s public Blob store. Existing web storage variables remain separate.

The preview/development resources are `read-it-later-native-speech-preview` (Neon free plan and
private Blob). Production is not connected. Add keys privately to the deployment environment
or gitignored `.env.local`; redeploy after changing server variables. No provider subscription
or paid speech request is provisioned automatically.

For a separate speech-only database run `pnpm db:migrate:speech`. It applies the additive
`0012_native_speech_cache.sql` through Drizzle with a separate migration ledger and advisory lock.
It requires `NATIVE_SPEECH_DATABASE_URL` and never migrates the web database. Shared deployments
that intentionally use the web DB use the standard migration chain (`pnpm db:migrate`).
The full standard migration chain has also been verified on a fresh isolated auth database.

The API is intentionally unrestricted for private prototyping, as requested. The replaceable
access policy currently returns a prototype namespace for generation/read/delete. Before public
release, replace it with verified accounts, artifact ownership, durable usage accounting and
rate/concurrency/budget limits. A cache hash is not authentication.

### Contract and storage

- `GET /api/native/speech/voices` returns resolved voice descriptors and protocol version 1.
- `POST /api/native/speech/stream` accepts `{text, descriptor}` (at most 2,000 UTF-16 units).
  HTTP 202 plus `Retry-After: 1` means an existing worker owns generation; retry the same request.
- HTTP 200 is NDJSON: `start`, Base64 `audio` frames, optional `marks`, `audioComplete`, then
  `archive`. Audio is signed 16-bit little-endian mono PCM at 24 kHz. Mark offsets are relative
  to the original chunk in UTF-16; times are seconds at 1×. Uncertain normalization mapping
  stops word highlighting and leaves paragraph highlighting active.
- `audioComplete` is synthesis EOF, not a promise that backend storage has completed. Playback
  advances from the render clock without waiting for archive acknowledgment. A complete local
  copy survives an archive acknowledgment failure.
- `GET /api/native/speech/cache/<id>` replays a stored artifact. `?status=1` checks state.
  `DELETE` removes that artifact and fences old workers; explicit later playback may recreate it.
  This is artifact deletion, not an article reference or whole-library deletion.

A database lease plus a unique fencing token coordinates workers across instances. Admitted
jobs finish their already-billable chunk after subscriber departure, bounded by 120 seconds;
Blob upload is separately bounded. A crash after uncertain provider dispatch can still cause
another billable request after takeover. Paid artifacts have no automatic server expiry.
The compressed archive contains audio/timing/configuration, not source article text.

On-device complete artifacts are stored atomically under Caches. The 200,000,000-byte LRU
removes audio unused for 28 days. iOS may purge Caches sooner. **Clear audio from this iPhone**
stops playback and clears local copies; it does not delete server copies. Bookmarks/settings
are outside the audio cache. Article/notes/highlights remain in the existing SQLite library.

`pnpm speech:maintenance` reports the retained orphan queue. Deletion, including
`--apply`, is disabled until store-wide reference authority can prove ownership:
an independent or cloned database may still reference the same paid blob.
Published audio and queued uploads remain stored. See `docs/audio-usage.md`.

### Implementation and verification

`SpeechService.stream` supplies incremental events; the completed `generate` method remains
for compatibility. `PCMPlaybackTransport` schedules buffers through AVAudioEngine and
AVAudioUnitTimePitch. Render callbacks queue sections independently of the 100 ms UI ticker.
`BackendSpeechService` validates frames and persists complete chunks. `SimulatedSpeechService`
remains silent and deterministic. The UI-test-only PCM fixture exercises the real renderer
without making paid requests.

Core tests cover original-source Unicode offsets, stale results, streaming before EOF,
estimated versus final duration, pause during prefetch, cache expiry/eviction, and HTTP decoding
with offline replay. Backend tests cover provider framing/timing/errors and delayed archive
completion. Set `NATIVE_SPEECH_TEST_DATABASE_URL` to an **isolated local** Postgres database
and run `pnpm exec vitest run src/server/services/native-speech/cache.integration.test.ts`
for lease/takeover/deletion tests; they skip when not configured and refuse remote databases.
The simulator suite checks actual PCM progress in the background plus existing reader/share flows.
Live provider compatibility, audible latency, locked-phone sleep, interruptions and Bluetooth/
AirPlay need real credentials and physical-device validation; synthetic tests do not establish them.
