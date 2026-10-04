# Read It Later — native 0.1.1 developer preview

This is a **local-only, text-only prototype**, not the complete synchronized MVP
or an App Store-ready release. No web/backend files or database schemas changed.

## Included

- Native iPhone SwiftUI app (iOS 17+, Swift 6 / Xcode 16+).
- Persistent GRDB/SQLite library. Saves URL before attempting download.
- Direct on-device HTML-to-text extraction using SwiftSoup (no publisher scripts).
- Offline text reading, search, favorites, read/unread, article-level notes.
- Local text highlights: select text → Highlight; open Highlights to change color or remove.
- Safari Share Extension: durable App Group inbox; main app imports and downloads.
- JSON export, explicit download failures and manual retries.
- Core tests and macOS CI build of the app and extension.

## Deliberately not included

Account login/sync, full HTML/images, web highlight synchronization, reading-position sync,
folders, PDFs, TTS, widgets, background download guarantees, and JSON re-import.
The final architecture remains the hardened plan; this preview isolates native
capture/storage/reading before changing the live backend. Text extraction is a
simple heuristic, not Mozilla Readability, and may retain boilerplate or fail on
JavaScript-heavy/login-required pages. HTTP sites may be blocked by App Transport
Security; use HTTPS. No ATS exception is enabled.

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
6. Add TTS after the core product is reliable.

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
