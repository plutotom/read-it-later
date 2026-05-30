# Text-to-Speech (TTS) Feature

This document describes the TTS feature that converts saved articles to listenable audio using Google Cloud Text-to-Speech.

## Overview

- **Provider**: [Google Cloud Text-to-Speech](https://cloud.google.com/text-to-speech/docs)
- **Storage**: Vercel Blob (public MP3 URLs)
- **Format**: MP3
- **Chunking**: HTML → plain text, then ~4000 characters per chunk at sentence boundaries
- **Caching**: One `article_audio` row per article (per owner); regeneration replaces blob + row
- **Usage tracking**: Monthly standard-equivalent character quota per user (`tts_usage`)

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

One row per user per calendar month (`YYYY-MM`). Tracks both raw and weighted character consumption:

```typescript
{
  id: text,
  userId: text,
  billingPeriod: varchar(7),     // "YYYY-MM"
  charactersUsed: integer,       // Standard-equivalent weighted total
  rawCharactersUsed: integer,    // Raw characters sent to Google TTS API
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

Unique on `(userId, billingPeriod)`.

**Weighted quota formula:**

```text
weightedChars = rawChars × priceMultiplier(voice)
```

| Voice tier | Multiplier |
|------------|------------|
| Standard | 1× |
| WaveNet | 4× |
| Neural2 | 4× |
| Studio | 16× |

**Free tier:** 4,000,000 standard-equivalent characters per month (`TTS_FREE_TIER_LIMIT` in `src/lib/tts-voices.ts`).

**When usage is charged:**
- After successful audio generation in `getAudio` (cache miss) or `regenerateAudio`
- Not charged on cache hits, playback, progress updates, or deletes

Usage is recorded atomically with the `article_audio` insert (same DB transaction).

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
| `tts.getUsage` | Query | Protected | Monthly weighted usage vs 4M standard-equivalent limit |
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
5. In one transaction: upsert `tts_usage` (weighted + raw) and insert `article_audio`.

Character counts are accumulated per chunk at synthesis time (`text.length` of each API request). Duration is estimated from byte size (~128 kbps), not parsed from the MP3.

## Usage Example (tRPC client)

```typescript
const utils = api.useUtils();

// First-time generation (disabled query + refetch, or regenerateAudio mutation)
const { data: audio } = await generateAudioQuery.refetch();

// Check without generating
const { hasAudio, audio: cached } = await utils.tts.getStatus.fetch({ articleId });

// After generation, refresh status and usage caches
await utils.tts.getStatus.invalidate({ articleId });
await utils.tts.getUsage.invalidate();
```

## Voice Options

See [Google Cloud TTS voices](https://cloud.google.com/text-to-speech/docs/voices).

| Tier | Examples | Quota multiplier |
|------|----------|------------------|
| Standard | `en-US-Standard-A` … `J` | 1× |
| WaveNet | `en-US-Wavenet-*` | 4× |
| Neural2 | `en-US-Neural2-*` | 4× |
| Studio | `en-US-Studio-*` | 16× |

All tiers share one monthly cap of **4M standard-equivalent characters**. A 10k-character article with Neural2 consumes 40k from the quota.

Full list and labels: `src/lib/tts-voices.ts`.

## Known Limitations

- MP3 chunks are concatenated naively (possible glitches between chunks on very long articles).
- Regeneration is required after changing voice preference for existing articles.
- Public share plays whichever `article_audio` row exists for that article (first match by `articleId`).
