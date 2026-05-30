# Text-to-Speech (TTS) Feature

This document describes the TTS feature that converts saved articles to listenable audio using Google Cloud Text-to-Speech.

## Overview

- **Provider**: [Google Cloud Text-to-Speech](https://cloud.google.com/text-to-speech/docs)
- **Storage**: Vercel Blob (public MP3 URLs)
- **Format**: MP3
- **Chunking**: HTML → plain text, then ~4000 characters per chunk at sentence boundaries
- **Caching**: One `article_audio` row per article (per owner); regeneration replaces blob + row
- **Usage tracking**: Monthly character counts per user and voice tier (`tts_usage`)

Voice preference lives on `user_preferences.ttsVoiceName` (fallback: `TTS_VOICE_NAME` env).

## Database Schema

### `article_audio`

Cached audio and playback progress (scoped to the user who generated it).

```typescript
{
  id: uuid,
  userId: text,              // Owner (Better Auth user)
  articleId: uuid,           // Unique per article — one cached audio per article
  audioUrl: text,            // Vercel Blob URL
  voiceName: text,           // e.g. "en-US-Standard-A"
  durationSeconds: real,     // Estimated at generation time
  fileSizeBytes: integer,
  currentTimeSeconds: real,  // Resume position (default 0)
  lastPlayedAt: timestamp,
  generatedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

### `tts_usage`

Tracks characters synthesized per user, calendar month (`YYYY-MM`), and voice tier (`standard` | `wavenet` | `neural2` | `studio`) for UI limits aligned with Google’s free tiers.

### `user_preferences`

- `ttsVoiceName` — preferred voice for new generations

## API Endpoints (tRPC)

| Endpoint | Type | Auth | Description |
|----------|------|------|-------------|
| `tts.getAudio` | Query | Protected | Return cached audio or generate, save, and return |
| `tts.getStatus` | Query | Protected | Whether audio exists (no generation) |
| `tts.regenerateAudio` | Mutation | Protected | Delete blob + row, regenerate (voice change) |
| `tts.deleteAudio` | Mutation | Protected | Delete cached audio |
| `tts.updateProgress` | Mutation | Protected | Save `currentTimeSeconds` / `lastPlayedAt` |
| `tts.getVoiceConfig` | Query | Protected | User’s voice + language code |
| `tts.getUsage` | Query | Protected | Monthly character usage vs tier limit |
| `tts.getStatusByShareToken` | Query | Public | Audio URL for a shared article (playback only) |

## Environment Variables

```bash
# Google Cloud TTS (required for generation)
GOOGLE_CLOUD_TTS_CREDENTIALS='{"type":"service_account",...}'  # JSON string

# Vercel Blob (required for storage)
BLOB_READ_WRITE_TOKEN=your_token

# Defaults when user has no preference (optional)
TTS_VOICE_NAME=en-US-Standard-A
TTS_VOICE_LANGUAGE=en-US
```

Both `GOOGLE_CLOUD_TTS_CREDENTIALS` and `BLOB_READ_WRITE_TOKEN` are optional in `src/env.js` for local builds; generation fails at runtime if they are missing.

## Files

| File | Description |
|------|-------------|
| `src/server/db/schema.ts` | `article_audio` table |
| `src/schemas/auth.ts` | `tts_usage`, `user_preferences.ttsVoiceName` |
| `src/server/services/tts.ts` | HTML stripping, chunking, synthesis, blob upload |
| `src/server/api/routers/tts.ts` | tRPC router |
| `src/lib/tts-voices.ts` | Voice labels/tiers for UI |
| `src/env.js` | Env validation |
| `src/app/_components/audio-player.tsx` | Article reader dock player |
| `src/app/_components/public-audio-player.tsx` | Shared link playback (no generation) |
| `src/app/_components/voice-selector.tsx` | Preferences voice picker |
| `src/app/_components/tts-usage-display.tsx` | Usage meter on preferences |
| `src/app/(protected)/preferences/page.tsx` | Voice + usage settings |

## Frontend Flow

### Logged-in reader (`AudioPlayer`)

1. `tts.getStatus` on mount — if cached, load URL and resume position.
2. **Generate narration** — `tts.getAudio` (fetch) for first generation; `tts.regenerateAudio` when forcing a new voice or explicit regenerate.
3. On success, local playback state updates immediately; `getStatus` is invalidated so server and UI stay in sync.
4. Hidden `<audio>` element loads metadata → **ready**; progress saved every 5s and on pause/end via `tts.updateProgress`.
5. Expanded sheet: seek, speed (localStorage), skip, optional jump-to-reading-position in the article.

### Public share (`PublicAudioPlayer`)

- `tts.getStatusByShareToken` only — plays existing audio if the owner generated it.
- Progress stored in `localStorage` (`tts-progress-{articleId}`), not the server.

## Backend Generation Flow

1. Load article HTML (owner check).
2. `stripHtmlToPlainText` (JSDOM) → `chunkText` (~4000 chars).
3. For each chunk: Google `synthesizeSpeech` (MP3).
4. Concatenate buffers → `put` to Vercel Blob at `article-audio/{articleId}.mp3`.
5. Insert `article_audio`, increment `tts_usage`.

Duration is estimated from byte size (~128 kbps), not parsed from the MP3.

## Usage Example (tRPC client)

```typescript
const utils = api.useUtils();

// First-time generation (disabled query + refetch, or regenerateAudio mutation)
const { data: audio } = await generateAudioQuery.refetch();

// Check without generating
const { hasAudio, audio: cached } = await utils.tts.getStatus.fetch({ articleId });

// After generation, refresh status cache
await utils.tts.getStatus.invalidate({ articleId });
```

## Voice Options

See [Google Cloud TTS voices](https://cloud.google.com/text-to-speech/docs/voices).

| Tier | Examples | Relative usage (app limits) |
|------|----------|-----------------------------|
| Standard | `en-US-Standard-A` … `J` | 1× (4M chars/mo UI cap) |
| WaveNet | `en-US-Wavenet-*` | 4× (1M chars/mo) |
| Neural2 | `en-US-Neural2-*` | 4× (1M chars/mo) |
| Studio | `en-US-Studio-*` | Higher tier (250k chars/mo) |

Full list and labels: `src/lib/tts-voices.ts`.

## Known Limitations

- MP3 chunks are concatenated naively (possible glitches between chunks on very long articles).
- Regeneration is required after changing voice preference for existing articles.
- Public share plays whichever `article_audio` row exists for that article (first match by `articleId`).
