# Native iOS speech implementation plan

Status: Approved for implementation. Implementation requires the user's approval.

Updated: October 16, 2026.

## Purpose

Turn the native iOS silent listening prototype into real speech playback with quick paragraph starts, synchronized highlighting, reusable generated audio, and interchangeable speech providers. The player should request the selected section immediately and start playing as audio arrives, without waiting for the full article to be generated.

The user will review this plan before implementation begins. Writing this document does not authorize provider setup, paid generation, storage provisioning, or production deployment.

## Agreed product decisions

- Keep the existing native reader and mini/full player as the foundation.
- Put provider-specific integrations behind a common interface. Switching providers must not require rebuilding playback or paragraph navigation.
- Keep private-prototype usage unrestricted. Do not add a login, shared password, or app-enforced user quota in this pass.
- Add account verification and server-enforced usage limits before the app and paid speech endpoint become public.
- Limit the phone's persistent audio cache to **200 MB** and remove audio sections that have not been used for **28 days**.
- Retain completed audio on the backend beyond the phone's cleanup window. A local eviction should normally lead to a download of existing audio, not another paid generation.
- Use **Vercel Blob** for backend audio and timing files, with **PostgreSQL** tracking cache metadata.
- Treat the server cache's retention and storage budget separately from the phone's 200 MB limit.

## Proposed implementation defaults

Start with **Speechify**, then add **Inworld** as a second adapter to prove interchangeability. Speechify is the proposed initial default; the user can change this choice during review. Begin with English narration and expose additional languages only when the selected model and voice support them.

Use native AVFoundation playback. Prefer a common streaming PCM format, initially targeting 24 kHz, mono, signed 16-bit little-endian audio. Confirm both adapters can produce that format during the first implementation milestone; normalize supported differences at the adapter boundary.

Use a versioned newline-delimited JSON stream between our backend and iOS. Audio events carry bounded Base64 payloads; timing events can arrive independently. Measure the overhead before considering a binary transport. Provider-specific SSE or JSON framing stays inside the backend adapters.

## Current implementation

The current iOS build is silent. It has paragraph actions, mini/full player controls, simulated word timing, preparation of the selected chunk and two upcoming chunks, cancellation, stale-response rejection, and an in-memory cache. It has no speech endpoint, real audio transport, disk audio cache, or backend cache for native speech.

The separate web TTS implementation already uploads full-article MP3 files to Vercel Blob using public access. Its `article_audio` table stores one audio result per article. That structure does not provide the provider/model/voice/chunk cache required here. Add a separate native speech path and additive schema migrations; preserve existing web TTS behavior.

Relevant starting points:

- [Speech service and transport contracts](../../ios/ReadingCore/Sources/ReadingCore/SpeechService.swift).
- [Paragraph and chunk mapping](../../ios/ReadingCore/Sources/ReadingCore/ListeningDocument.swift).
- [Listening controller](../../ios/ReadingCore/Sources/ReadingCore/ListeningPlayer.swift).
- [Reader selection and highlights](../../ios/App/HighlightTextView.swift).
- [Mini and expanded player](../../ios/App/ListeningPlayerView.swift).
- [Generated project configuration](../../ios/project.yml).
- [Existing web audio uploads](../../src/server/services/tts.ts).
- [Existing backend schema](../../src/server/db/schema.ts).

## Architecture and responsibilities

The iOS player calls one backend speech API. The backend applies an access policy, checks its cache, and invokes a configured provider adapter only when generation is needed.

**The iOS player** owns reading position, paragraph priority, audio scheduling, speed, scrubbing, sleep, highlighting, local caching, and system playback controls. It does not hold provider credentials or parse provider responses.

**The backend speech service** owns provider selection, voice configuration, request validation, stream normalization, server cache lookup, duplicate-generation coordination, persistence, and diagnostic events.

**Each provider adapter** owns its authentication, API/model/voice mapping, request limits, stream parser, audio format handling, timing conversion, cancellation, and error translation. Implement a shared adapter test suite and run it against both adapters.

**The access policy** is a separate interface before cache retrieval and generation. Private-prototype mode allows requests without accounts. The accounts pass will replace that policy with verified identities and durable usage enforcement. No client-supplied identifier is a trusted account identity.

## Shared speech contract

The request identifies the protocol version, request ID, exact chunk text, language, and selected voice/configuration revision. The backend validates all fields and resolves provider settings against its configured catalog. It never accepts arbitrary upstream URLs, credentials, or unrestricted provider options from the client.

Return these normalized events:

- `start`: request/chunk identity, resolved provider/model/voice, configuration revision, audio format, and whether this is a server cache hit.
- `audio`: monotonically sequenced audio bytes for that request.
- `marks`: finalized word start/end times and text ranges. Times are seconds at 1× speed; ranges are UTF-16 offsets relative to the exact requested text.
- `complete`: final duration, audio integrity/size metadata, and a reference to the completed server cache entry when persistence succeeded.
- `error`: a stable error code, retry guidance, and request identity. A stream ending without completion is incomplete even if its HTTP status was 200.

Audio and timestamps may arrive in separate events. Handle arbitrary network fragmentation, timestamps arriving after audio, empty timing batches, unknown optional events, malformed responses, and connection loss. Validate bounded frame sizes, timing ranges, sequence order, and total buffered bytes.

A provider capability description includes languages, streaming support, word-timing support, supported audio formats, input-size units, and concurrency limits. Do not substitute simulated word timings when a real provider lacks alignment; fall back to highlighting the current section.

Keep the silent service as a test adapter for deterministic UI and controller tests.

## Backend routes and configuration

Proposed route namespace:

- `GET /api/native/speech/voices`: configured provider/voice catalog, capabilities, default selection, and configuration revision.
- `POST /api/native/speech/stream`: prepare or replay one chunk through the normalized event stream.
- `GET /api/native/speech/cache/[id]`: retrieve a completed cached result through the same access-policy boundary.

These are planned routes, not existing endpoints. Set provider credentials and the default provider/model in server configuration. Add environment variables through `src/env.js`; obtain secrets through the private secret-entry mechanism during implementation. Keep model choices explicit and validate pinned API versions against the provider's supported versions.

An active session stays pinned to its resolved provider/model/voice/configuration. A server default change affects new sessions. Explicit provider changes cancel the old session and select a supported replacement voice. Do not silently switch providers or voices after an error.

Validate chunk size in the unit required by the selected provider, including UTF-16 versus Unicode code points or bytes. Retain ordinary request deadlines, cancellation, bounded buffers, and input validation in unrestricted prototype mode. Do not build automatic retry loops that repeatedly regenerate failed or partly delivered audio.

## Paragraph playback and native audio

Retain stable UTF-16 offsets into the original article text. Use the current roughly 30–60-word chunks as the starting point, with safe splitting for oversized paragraphs and provider limits. Avoid submitting the full article for a paragraph jump.

Request the selected chunk first. Prepare up to two upcoming chunks within the provider's concurrency allowance. Cache hits bypass provider generation. Rapid jumps stop old audio immediately, cancel unneeded requests, and invalidate old events with a session/generation identity.

Replace simulated timing with the actual audio render position. Start after a small initial buffer, queue upcoming audio for continuous playback, and apply 0.5–3× speed locally while preserving pitch. The controller's 100 ms UI polling must not be the mechanism that schedules audio transitions.

Preserve pause state across voice changes. Preserve the paragraph and nearest reliable word when switching voices/providers; timing in seconds is not portable between different voices. Scrubbing and ±15-second controls resume playback, matching the existing prototype behavior.

The total article timeline remains estimated where audio has not been prepared. Use actual durations as results become available. Seeking inside prepared audio can be precise; seeking into unprepared sections uses the estimate and must not require generating all preceding sections.

## Cache identity and lookup

Use the same cache identity on the device and backend. Derive it from the exact text hash, provider, model, voice, language, generation settings, audio format, configuration revision, and contract/adapter version. Add the server-controlled ownership namespace on the backend. Playback speed is local and does not create a new speech-generation variant.

Lookup order is local completed cache, backend completed cache, then provider generation. Repeated playback or device cleanup must not trigger generation when a valid backend copy is available.

Coordinate identical generation requests across backend instances using a database-backed unique key and recoverable lease. A process-local map alone is insufficient on serverless infrastructure. Requests arriving during generation join/wait for that result or receive a bounded pending response; they must not each start a paid provider call. Recover abandoned leases and distinguish completed, generating, and failed results.

Cache only complete, validated results. Streaming starts before archival finishes. Finalize audio and timing files, then publish completed metadata atomically. Perform bounded storage retries while the backend still holds the completed result. If archival remains unavailable, report the result as played but not durably cached and retain the local complete copy within the device cap. Never claim that replay is protected against regeneration until a reusable copy exists.

Cancellation or an infrastructure failure may still incur provider charges without producing a reusable result. Caching reduces repeat generation; it cannot guarantee that every billed request produces a recoverable file.

## Local cache retention

Set the persistent audio-and-timestamp cache limit to **200,000,000 bytes**. Apply the cap to completed files plus bounded temporary download files; keep the in-memory playback buffer separately bounded. Save listening bookmarks/preferences outside the evictable cache.

Update a section's `lastUsedAt` when it is used for playback, not merely prefetched. Remove sections unused for **28 days**. If the cache fills sooner, evict the least recently used sections. Do not routinely wipe the whole cache. Run cleanup at launch and during writes; the app need not wake exactly when an entry reaches 28 days.

Protect the active section from eviction and clean up abandoned partial files. Prefer evicting entries confirmed on the backend. If the only complete copy is local because upload failed, preserve it preferentially within the cap and expose its archive-failure state. The 200 MB cap still applies; an unarchived copy lost to eviction, OS cleanup, or device loss may require regeneration.

Provide a **Clear downloaded audio** action that clears local audio/timing files while keeping saved articles, notes, and server copies. Explain that cached sections work offline and evicted sections require a connection to download. A local cache clear is not a server deletion request.

## Backend storage and retention

Store native speech audio and timing manifests in a **separate private Vercel Blob store**. PostgreSQL stores cache identity, ownership namespace, Blob references, state, format, duration, size, integrity metadata, timestamps, and generation-lease information. Audio bytes do not belong in PostgreSQL.

Confirm the archive encoding during the initial playback milestone. Prefer a compressed representation when the chosen streaming/decoding path supports it; raw PCM uses more disk and transfer bytes. Changing storage encoding should reuse or locally transcode existing audio where practical, rather than request the same speech from a provider again.

The installed Blob SDK exposes public uploads only. Upgrade it to a version supporting private storage during implementation, validate existing web uploads, and configure a separate native-store credential/store selection. Do not repoint the existing web store or silently change its public uploads. Vercel documents private storage support starting with JS SDK 2.3; select a supported version when implementing. [Private storage documentation](https://vercel.com/docs/vercel-blob/private-storage)

Private Blob credentials remain on the server. The app retrieves cached files through our backend. Private object storage does not make an anonymous backend route authenticated: the prototype route is intentionally unrestricted and is not suitable for public multi-user access until the accounts pass.

Backend completed audio has **no automatic four-week expiry**. Initially retain it until explicit server cleanup/deletion, corruption recovery, or a separately approved server retention policy. Track total bytes and last access so storage growth is visible. The phone's 200 MB cap does not apply to this store, and downloads still incur hosting/transfer costs even when generation is reused.

Provide explicit server deletion handling distinct from clearing local downloads. Remove metadata and objects consistently, cancel affected generation, and prevent an in-flight result from recreating a deleted entry. If an object has multiple references within its ownership namespace, delete its bytes only when the last retained reference is removed. Define account deletion and final server storage budgets in the public-release pass.

Use an isolated server-controlled prototype namespace initially. Account support must replace this with verified ownership and a reviewed migration/deletion policy for prototype data. Do not enable cross-account cache sharing by default or treat a text hash as authorization.

## Persistence and system playback

Save article/content identity, paragraph/word offset, selected provider/voice, playback speed, and last position across launches. Restore only when the content/configuration still matches, or offer a sensible paragraph fallback. A missing disk file is a cache miss, not a reason to reset the user's saved library.

Add background audio capabilities through `ios/project.yml`. Implement audio session handling, lock-screen metadata and controls, system output routing, and headphone/Bluetooth playback controls. Handle interruptions, route changes, headphones disconnecting, and foreground/background transitions. Respect user pause intent when deciding whether to resume.

Use real audio completion and interruption events. Verify the sleep deadline with the phone locked, including speed changes and buffering. Preserve the existing end-of-article stop behavior and do not introduce automatic playback of another article in this pass.

## Usage and public release

The private prototype has no account requirement, shared password, per-user quota, or app-enforced spending cap. Provider account restrictions and ordinary protocol/resource limits still apply. This decision supersedes earlier suggestions to lock paid generation until accounts exist.

Keep a replaceable access/usage interface before generation and cached-file delivery. Diagnostic events can record request ID, provider/model, input character count, available provider usage, cache outcome, timing, and failure category. Do not log article text, notes, credentials, or full provider error payloads containing private input. Label cost estimates as estimates; local or process-memory counters are not durable billing enforcement.

Before public release, require verified accounts, ownership checks on cached audio, durable usage accounting, per-account and global rate/concurrency/budget enforcement, and appropriate protection for anonymous traffic. Enforce limits before provider dispatch, including concurrent requests and uncertain billing after cancellation. Add deletion/privacy controls and review retention. These controls are a separate release milestone, not implemented merely by adding this interface.

## Implementation milestones

### Milestone 1 Streaming contract and Speechify playback

Define versioned contracts and capabilities, add the native backend routes and Speechify adapter, and implement a minimal native streaming audio transport. Keep the prototype access policy unrestricted. Prove one complete flow: tap a paragraph, stream through our backend, hear audio before the chunk finishes, and highlight from real timing data.

Acceptance: the first paragraph does not wait for a full article or completed chunk; fragmented audio/timing streams work; provider credentials are absent from the app; cancellation and stale results cannot play the wrong section.

### Milestone 2 Durable backend and local cache

Add additive PostgreSQL migrations, private Blob integration, cross-instance generation coordination, validated completed-result persistence, backend retrieval, and the 200 MB/28-day local cache. Save bookmarks and preferences. Build storage retry and explicit local/server deletion behavior.

Acceptance: deleting the phone's cached copy and replaying downloads the same backend result with no new provider call. Simulated 28-day expiry and size pressure obey the local rules. Partial or corrupt results never become valid cache hits. Generation coordination works across separate service instances.

### Milestone 3 Inworld and provider switching

Implement the Inworld adapter against the same contract, add a private testing provider selector, and verify voice mapping, capability differences, and configuration changes. Pin active sessions and isolate cache variants.

Acceptance: both adapters pass shared contract tests. Switching provider does not require player changes, does not reuse incompatible cached audio, and preserves the paragraph/nearest reliable word. Live verification requires credentials for both providers; mocked tests alone do not establish real provider compatibility.

### Milestone 4 Complete native playback controls

Finish buffering and section transitions, scrubbing, speed, voice/provider changes, mini/full player states, error recovery, background audio, sleep timers, lock-screen controls, and system route handling.

Acceptance: controls agree across reader/player/system surfaces. Prepared sections transition without unintended gaps. Interruptions and headphones disconnecting respect pause intent. Saved reading/highlight behavior remains intact.

### Milestone 5 Verification and review build

Run the repository gate, native core/UI tests, isolated storage/migration tests, deployed native speech API checks, and physical-device listening checks. Deliver the branch/PR, simulator build, setup instructions, and measured latency/cache results for review. Keep the existing web application behavior covered by regression tests.

## Verification and performance goals

Cover Unicode and long paragraphs; fragmented stream frames; late/missing timestamps; malformed, duplicate, and stale events; slow/offline connections; provider throttling/errors; bounded retries; mid-stream failures; cancellation; audio scheduling; cache expiry/eviction; backend re-download; storage failure; deletion races; lease recovery; and isolated preview data. Test timestamp parsing and audio playback with real provider fixtures as well as deterministic simulated streams.

Run the full repository gate required by `AGENTS.md`, including frozen pnpm install, formatting, lint, typecheck, tests, and production build. Run Swift core tests, build the app/extension, and run simulator UI regression tests. Because implementation will add backend/data behavior, the earlier iOS-only web-preview waiver is not a waiver of testing the new deployed speech API. Verify the native routes against isolated preview storage/data without changing production configuration.

Measure time from the user's action to **audible sound**, not just the first response byte. Report cold generation, backend cache hits, local cache hits, paragraph jumps, and section transitions separately, with device, network, provider/model/voice, sample count, median, and tail results. Use public test articles and synthetic Unicode fixtures.

Initial goals are under **2 seconds** for fresh paragraph playback on ordinary Wi-Fi and under **200 ms** for local cached playback. These are proposed end-to-end targets, not measured results or provider guarantees. Test the same text on both providers. Physical-device validation must include locked-phone playback, sleep, interruptions, output routes, and changing speed.

## Setup and review dependencies

Implementation needs the user's approval of this plan, a final initial-provider choice, server-side provider credentials, access to provision/connect a private Blob store, and isolated PostgreSQL preview migration access. Confirm the installed SDK and hosting configuration support streaming/cancellation and bounded background finalization before choosing their exact APIs. Physical iPhone installation also needs working signing/provisioning.

Provider subscriptions, infrastructure purchases, public release, accounts, and quota enforcement are not completed or approved by this document. Obtain credentials privately when implementation reaches those steps; never place secrets in chat, source control, or the iOS bundle.

## Official references

- [Speechify streaming with timestamps](https://docs.speechify.ai/build/api-reference/v1/audio/stream/with-timestamps): streamed audio and word marks, including marks-only events and terminal errors.
- [Inworld HTTP streaming](https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech-stream): provider framing, audio/timing events, input units, and cancellation/usage behavior.
- [Vercel private Blob storage](https://vercel.com/docs/vercel-blob/private-storage): private store setup, SDK compatibility, and server-side delivery.
- [Apple AVAudioEngine](https://developer.apple.com/documentation/avfaudio/avaudioengine): native audio processing foundation.

## Approval record

The architecture, unrestricted private-prototype access, 200 MB local cache, 28-day local inactivity cleanup, and backend reuse are recorded decisions. The user approved full implementation after Astra’s review on October 16, 2026. The Speechify-first/Inworld-second sequence is accepted; real provider and physical-device validation remain explicit setup dependencies.

## Astra review decisions (October 16, 2026)

- Replace completed-response-only playback with incremental events and a PCM render queue. Audio EOF is distinct from archive acknowledgment; never wait for Blob to advance playback.
- Cache acquisition uses an atomic database lease, renewed while working, with a unique fencing token. Duplicate requests receive pending/retry status. Once admitted, a bounded job finishes its already-paid chunk even if a subscriber disconnects; subscribers never own the shared job. Provider timeouts and explicit deletion stop publication. A crashed dispatch may be charged twice after lease takeover; exactly-once billing cannot be guaranteed.
- Word alignment is conservative and monotonic against the original UTF-16 source. If normalization or an expansion cannot be mapped confidently, stop word highlighting and retain paragraph highlighting.
- Synthesis identity includes exact text and resolved voice/model/language/normalization/rate. Catalog, wire protocol, archive encoding, and app versions do not invalidate paid audio. Persist resolved descriptors for offline replay.
- Server deletion targets a cache artifact, not an article reference. A later explicit play can recreate it with a new fence. Tombstones reject stale workers; failed orphan deletion remains recorded for retry.
