# Text-to-Speech (TTS) Feature

This document describes the TTS feature that converts articles to audio using Google Cloud Text-to-Speech.

## Overview

- **Provider**: Google Cloud Text-to-Speech (Standard voices - $4/1M characters)
- **Storage**: Vercel Blob for audio file caching
- **Format**: MP3
- **Chunking**: Articles split at sentence boundaries (~4000 chars/chunk)

## Database Schema

The `article_audio` table stores cached audio and playback progress:

```typescript
{
  id: uuid,
  articleId: uuid,           // Links to article
  audioUrl: text,            // Vercel Blob URL
  voiceName: text,           // Voice used (e.g., "en-US-Standard-A")
  durationSeconds: real,     // Audio length
  fileSizeBytes: integer,    // File size
  currentTimeSeconds: real,  // Playback position
  lastPlayedAt: timestamp,   // For "continue listening"
  generatedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

## API Endpoints (tRPC)

| Endpoint | Type | Description |
|----------|------|-------------|
| `tts.getAudio` | Query | Get audio URL, generates if not cached |
| `tts.getStatus` | Query | Check if audio exists without generating |
| `tts.regenerateAudio` | Mutation | Force regenerate (e.g., voice change) |
| `tts.deleteAudio` | Mutation | Delete cached audio |
| `tts.updateProgress` | Mutation | Save playback position |
| `tts.getVoiceConfig` | Query | Get current voice settings |

## Environment Variables

```bash
# Google Cloud TTS (required for audio generation)
GOOGLE_CLOUD_TTS_CREDENTIALS='{"type":"service_account",...}'  # JSON stringified

# Vercel Blob (required for audio storage)
BLOB_READ_WRITE_TOKEN=your_token

# Voice configuration (optional)
TTS_VOICE_NAME=en-US-Standard-A      # Default voice
TTS_VOICE_LANGUAGE=en-US             # Default language
```

## Files

| File | Description |
|------|-------------|
| `src/server/db/schema.ts` | `article_audio` table definition |
| `src/server/services/tts.ts` | Core TTS service (chunking, synthesis, upload) |
| `src/server/api/routers/tts.ts` | tRPC endpoints |
| `src/env.js` | Environment variable definitions |

## Usage Example (Frontend)

```typescript
// Get audio for an article (generates if not cached)
const { data } = api.tts.getAudio.useQuery({ articleId: article.id });

if (data?.audioUrl) {
  // Play audio
  const audio = new Audio(data.audioUrl);
  audio.currentTime = data.currentTimeSeconds; // Resume from saved position
  audio.play();
  
  // Save progress periodically
  audio.ontimeupdate = () => {
    api.tts.updateProgress.mutate({
      articleId: article.id,
      currentTimeSeconds: audio.currentTime
    });
  };
}
```

## Voice Options

See [Google Cloud TTS Voices](https://cloud.google.com/text-to-speech/docs/voices) for all options.

Common voices:
- `en-US-Standard-A` to `en-US-Standard-J` (Standard, cheapest)
- `en-US-Wavenet-A` to `en-US-Wavenet-J` (Neural, 4x cost)
- `en-US-Neural2-A` to `en-US-Neural2-J` (Neural v2, 4x cost)
