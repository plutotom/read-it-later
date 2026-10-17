# Read It Later — native 0.2 developer preview

This is a **native reader with streaming speech support**. The library remains local to the iPhone; listening uses the separate native speech API. Account sync and public release remain later milestones.

## Included

- Native iPhone SwiftUI app (iOS 17+, Swift 6 / Xcode 16+).
- Persistent GRDB/SQLite library. Saves URL before attempting download.
- Direct on-device HTML-to-text extraction using SwiftSoup (no publisher scripts).
- Offline text reading, search, favorites, read/unread, article-level notes.
- Local text highlights: select text → Highlight; open Highlights to change color or remove.
- Safari Share Extension: durable App Group inbox; main app imports and downloads.
- JSON export, explicit download failures and manual retries.
- Streaming Speechify/Inworld adapters, paragraph playback, mini/full-screen player, speed/voice controls, scrubbing, sleep, background audio, and lock-screen controls.
- Persistent audio cache: 200 MB on-device, 28-day inactivity cleanup, and durable private backend reuse. Silent mode remains available for testing.
- Core tests and macOS CI build of the app and extension.

## Deliberately not included

Account login/sync, full HTML/images, web highlight synchronization, reading-position sync,
folders, PDFs, widgets, background download guarantees, and JSON re-import. Text extraction is a
simple heuristic, not Mozilla Readability, and may retain boilerplate or fail on
JavaScript-heavy/login-required pages. HTTP sites may be blocked by App Transport
Security; use HTTPS. The only ATS exception is localhost for simulator development; release speech-server validation still requires HTTPS.

## Run on your iPhone

1. On a Mac, install Xcode 16 or newer and its iOS SDK; open Xcode once.
2. Check out `feature/native-ios-rebuild` and install XcodeGen (`brew install xcodegen`).
3. From `ios`, run `xcodegen generate` and open `ReadItLater.xcodeproj`.
4. In both targets' Signing & Capabilities, select your Apple Developer team.
5. The provisional bundle IDs are `com.isaiahproctor.readitlater` and
   `com.isaiahproctor.readitlater.share`. If unavailable, change them in
   `project.yml` and regenerate. Update `APP_GROUP` at the same time.
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
this repository. TestFlight distribution requires a separately signed archive,
App Store Connect configuration, app icon, privacy review, and device validation.

## Test checklist

The automated simulator suite covers public HTTPS downloads, Safari sharing,
invalid-link draft recovery, duplicate saves, and notes/read state/favorites/highlights
surviving app restarts. It also checks highlight color changes and removal. The
checklist below still needs physical-device validation before distribution.

- [ ] First launch with no account presents an empty library.
- [ ] Paste a public HTTPS article; URL survives a failed download.
- [ ] Download text, enable airplane mode, force quit, reopen, and read it.
- [ ] Favorite/mark read; save a note; restart and verify each survives.
- [ ] Long-press article text, adjust selection, choose Highlight; reopen the article and verify its color remains.
- [ ] Open Highlights, change color, remove a highlight; check both list and reader update.
- [ ] Search title, URL, body text, and notes.
- [ ] Share from Safari while the app is closed; open the app and see the link.
- [ ] Share the same URL twice; confirm one article and no erased notes.
- [ ] Share before first main-app launch and verify later import.
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

1. Verify this build on physical hardware and fix capture/reader issues.
2. Implement rich reader snapshots/assets and web-compatible highlights.
3. Harden backend extraction and introduce tested account-scoped sync protocol.
4. Add Apple/Discord account linking, resumable guest import, recovery and deletion.
5. Finish release accessibility/privacy/icon/signing work; then TestFlight.
6. Validate live voices, latency, sleep, interruptions, and output routes on physical hardware.

## Highlight storage (0.1.1)

An additive `v2-highlights` SQLite migration preserves the existing library.
Highlights store UTF-16 offsets, exact quote, prefix/suffix, and a SHA-256 hash of
the extracted plain text. They are local to this reader's text, not interchangeable
with web HTML anchors yet. If article text changes, the quote is retained in the
Highlights sheet but not painted at potentially incorrect offsets. Automatic
re-anchoring and highlight-specific notes remain future work. Overlapping highlights
are retained; later painted ranges determine the visible overlap color.

JSON export now uses `{formatVersion: 2, articles: [...], highlights: [...]}` instead
of the initial bare article array. No existing on-device data is rewritten by export.

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
The existing chain currently has a fresh-database duplicate-column issue in migration 0009;
the speech-only command avoids running unrelated legacy migrations against the isolated database.

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

`pnpm speech:maintenance` reports old unreferenced uploads; `--apply` deletes only orphan
objects older than a day, retaining database retry records. It never ages out published audio.
Run it periodically in a trusted environment with the native database/store credentials.
Each pass scans at most 1,000 objects; large stores need a reviewed scheduled cleanup job.

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
