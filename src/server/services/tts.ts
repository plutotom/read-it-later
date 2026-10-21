/**
 * Text-to-Speech Service
 * Generates audio from article content using Google Cloud TTS
 * Supports chunking for long articles and caching via Vercel Blob
 */

import type { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { put, del } from "@vercel/blob";
import { env } from "~/env";
import {
  DEFAULT_VOICE,
  isChirp3Voice,
  toWeightedCharacters,
} from "~/lib/tts-voices";
import { htmlToChirpMarkup } from "~/server/services/tts-markup";
import { JSDOM } from "jsdom";
import type { google } from "@google-cloud/text-to-speech/build/protos/protos";
import { getGoogleTTSClient } from "./google-tts-client";
import { enforceMaxSentenceLength } from "./tts-text";
import { beginAttempt, finishAttempt } from "./audio-usage/ledger";
import { googleModel, prepareSpeech } from "./audio-usage/metering";
export { enforceMaxSentenceLength } from "./tts-text";

// Max characters per chunk (Google Cloud TTS limit is 5000 bytes, ~4000 chars to be safe)
const MAX_CHUNK_CHARS = 4000;

// Audio format settings
const AUDIO_ENCODING = "MP3" as const;
const AUDIO_CONTENT_TYPE = "audio/mpeg";

/**
 * Strip HTML tags and convert to speakable plain text
 * Handles common HTML elements appropriately for speech
 */
export function stripHtmlToPlainText(html: string): string {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Remove script and style elements
  document
    .querySelectorAll("script, style, noscript")
    .forEach((el) => el.remove());

  // Add natural pauses for block elements
  const blockElements = [
    "p",
    "div",
    "br",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "blockquote",
  ];
  blockElements.forEach((tag) => {
    document.querySelectorAll(tag).forEach((el) => {
      el.textContent = el.textContent + ". ";
    });
  });

  // Get text content and clean up
  let text = document.body?.textContent ?? "";

  // Clean up whitespace
  text = text
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .replace(/\.\s*\./g, ".") // Remove double periods
    .replace(/\s+\./g, ".") // Remove space before periods
    .trim();

  return text;
}

/**
 * Split text into chunks at sentence boundaries
 * Ensures each chunk is under the max character limit and preserves every character
 */
export function chunkText(
  text: string,
  maxChars: number = MAX_CHUNK_CHARS,
): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);

    if (end < text.length) {
      const slice = text.slice(start, end);
      const boundary = findLastSentenceBoundary(slice);
      if (boundary > 0) {
        end = start + boundary;
      } else {
        const fallback = findLastWordBoundary(slice);
        if (fallback > 0) {
          end = start + fallback;
        }
      }
    }

    if (end <= start) {
      end = Math.min(start + maxChars, text.length);
    }

    chunks.push(text.slice(start, end));
    start = end;
  }

  return chunks;
}

function findLastSentenceBoundary(slice: string): number {
  let best = -1;
  for (const delimiter of [". ", "! ", "? "]) {
    const idx = slice.lastIndexOf(delimiter);
    if (idx >= 0) {
      best = Math.max(best, idx + delimiter.length);
    }
  }
  return best;
}

function findLastWordBoundary(slice: string): number {
  const idx = slice.lastIndexOf(" ");
  return idx > 0 ? idx + 1 : -1;
}

/**
 * Synthesize a single text chunk to audio
 * Returns the audio buffer and character count billed for this chunk
 */
async function synthesizeChunk(
  client: TextToSpeechClient,
  chunk: string,
  voiceName: string,
  languageCode: string,
): Promise<{ buffer: Buffer; charactersUsed: number }> {
  const useMarkup = isChirp3Voice(voiceName);
  const input: google.cloud.texttospeech.v1.ISynthesisInput = useMarkup
    ? { markup: chunk }
    : { text: chunk };

  const [response] = await client.synthesizeSpeech(
    {
      input,
      voice: {
        languageCode,
        name: voiceName,
      },
      audioConfig: {
        audioEncoding: AUDIO_ENCODING,
      },
    },
    { retry: null, timeout: 90_000 },
  );

  if (!response.audioContent) {
    throw new Error("No audio content received from TTS API");
  }

  // Billable characters match the exact text sent to the API.
  // JS .length counts UTF-16 code units; rare emoji may differ slightly from Google's count.
  const charactersUsed = chunk.length;

  // audioContent can be string or Uint8Array
  const buffer =
    typeof response.audioContent === "string"
      ? Buffer.from(response.audioContent, "base64")
      : Buffer.from(response.audioContent);

  return { buffer, charactersUsed };
}

/**
 * Concatenate MP3 audio buffers
 * Simple concatenation works for MP3 files
 */
function concatenateAudioBuffers(buffers: Buffer[]): Buffer {
  return Buffer.concat(buffers);
}

/**
 * Calculate approximate audio duration from MP3 buffer
 * Uses a rough estimate based on typical MP3 bitrate (128kbps)
 */
function estimateAudioDuration(buffer: Buffer): number {
  // Assuming 128kbps MP3: bytes / (128000 / 8) = seconds
  const bytesPerSecond = 128000 / 8; // 16000 bytes per second
  return buffer.length / bytesPerSecond;
}

export interface GenerateAudioResult {
  audioUrl: string;
  durationSeconds: number;
  fileSizeBytes: number;
  voiceName: string;
  rawCharactersUsed: number; // Raw characters sent to TTS API
}

/**
 * Generate audio for an article
 * Handles chunking, synthesis, concatenation, and blob upload
 */
export function prepareArticleAudio(htmlContent: string, voiceName: string) {
  const speakableText = isChirp3Voice(voiceName)
    ? htmlToChirpMarkup(htmlContent)
    : stripHtmlToPlainText(htmlContent);

  if (!speakableText.trim()) {
    throw new Error("Article content is empty after HTML processing");
  }

  // Split any over-long sentence so Google TTS doesn't reject the request.
  const safeText = enforceMaxSentenceLength(speakableText);

  return chunkText(safeText);
}

export async function generateAudioForArticle(
  articleId: string,
  htmlContent: string,
  voiceNameOverride?: string,
  accounting?: {
    userId: string;
    jobId: string;
    fence: string;
    onDispatched: (units: number) => void;
  },
): Promise<GenerateAudioResult> {
  // Check if Blob token is available
  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required for audio storage");
  }

  const client = getGoogleTTSClient();
  const voiceName =
    voiceNameOverride ?? process.env.TTS_VOICE_NAME ?? DEFAULT_VOICE;
  // Derive language code from voice name (e.g., "en-US-Neural2-A" -> "en-US")
  const languageCode = voiceName.split("-").slice(0, 2).join("-");

  const chunks = prepareArticleAudio(htmlContent, voiceName);

  // Synthesize each chunk
  const audioBuffers: Buffer[] = [];
  let rawCharactersUsed = 0;
  try {
    for (const chunk of chunks) {
      const prepared = prepareSpeech(
        chunk,
        "google",
        googleModel(voiceName),
        voiceName,
      );
      const attempt = accounting
        ? await beginAttempt(
            accounting.jobId,
            accounting.userId,
            accounting.fence,
            prepared,
            undefined,
            {
              units: toWeightedCharacters(chunk.length, voiceName),
              raw: chunk.length,
            },
          )
        : undefined;
      accounting?.onDispatched(chunk.length);
      let buffer: Buffer;
      try {
        const result = await synthesizeChunk(
          client,
          prepared.submitted,
          voiceName,
          languageCode,
        );
        buffer = result.buffer;
        rawCharactersUsed += chunk.length;
        if (attempt)
          await finishAttempt(attempt, true, buffer.length).catch(() =>
            console.error("audio_accounting", {
              attempt,
              event: "settlement_failed",
            }),
          );
      } catch (error) {
        if (attempt)
          await finishAttempt(attempt, false, 0).catch(() => undefined);
        throw error;
      }
      audioBuffers.push(buffer);
    }
  } finally {
    await client.close().catch(() => undefined);
  }

  // Concatenate all audio
  const finalAudio = concatenateAudioBuffers(audioBuffers);

  // Upload to Vercel Blob
  const filename = `article-audio/${articleId}.mp3`;
  let blob: Awaited<ReturnType<typeof put>> | undefined;
  for (let retry = 0; retry < 3; retry++) {
    try {
      blob = await put(filename, finalAudio, {
        access: "public",
        contentType: AUDIO_CONTENT_TYPE,
      });
      break;
    } catch (error) {
      if (retry === 2) throw error;
    }
  }
  if (!blob) throw new Error("Audio could not be saved");

  return {
    audioUrl: blob.url,
    durationSeconds: estimateAudioDuration(finalAudio),
    fileSizeBytes: finalAudio.length,
    voiceName,
    rawCharactersUsed,
  };
}

/**
 * Delete audio from Vercel Blob
 */
export async function deleteAudioFromBlob(audioUrl: string): Promise<void> {
  await del(audioUrl);
}
