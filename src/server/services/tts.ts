/**
 * Text-to-Speech Service
 * Generates audio from article content using Google Cloud TTS
 * Supports chunking for long articles and caching via Vercel Blob
 */

import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { put, del } from "@vercel/blob";
import { env } from "~/env";
import { JSDOM } from "jsdom";

// Max characters per chunk (Google Cloud TTS limit is 5000 bytes, ~4000 chars to be safe)
const MAX_CHUNK_CHARS = 4000;

// Audio format settings
const AUDIO_ENCODING = "MP3" as const;
const AUDIO_CONTENT_TYPE = "audio/mpeg";

/**
 * Get Google Cloud TTS client
 * Supports credentials via JSON string in env var
 */
function getTTSClient(): TextToSpeechClient {
  const credentials = process.env.GOOGLE_CLOUD_TTS_CREDENTIALS;

  if (credentials) {
    try {
      const parsedCredentials = JSON.parse(credentials) as object;
      return new TextToSpeechClient({
        credentials: parsedCredentials,
      });
    } catch {
      throw new Error("Invalid GOOGLE_CLOUD_TTS_CREDENTIALS JSON format");
    }
  }

  // Fall back to Application Default Credentials
  return new TextToSpeechClient();
}

/**
 * Strip HTML tags and convert to speakable plain text
 * Handles common HTML elements appropriately for speech
 */
export function stripHtmlToPlainText(html: string): string {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Remove script and style elements
  document.querySelectorAll("script, style, noscript").forEach((el) => el.remove());

  // Add natural pauses for block elements
  const blockElements = ["p", "div", "br", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote"];
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
 * Ensures each chunk is under the max character limit
 */
export function chunkText(text: string, maxChars: number = MAX_CHUNK_CHARS): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = "";

  // Split by sentences (period, exclamation, question mark followed by space)
  const sentences = text.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    // If a single sentence is too long, split by comma or just force split
    if (sentence.length > maxChars) {
      // First, push any accumulated chunk
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

      // Split overly long sentences
      const subParts = sentence.split(/(?<=,)\s*/);
      for (const part of subParts) {
        if (part.length > maxChars) {
          // Force split at max chars (worst case)
          for (let i = 0; i < part.length; i += maxChars) {
            chunks.push(part.slice(i, i + maxChars).trim());
          }
        } else if (currentChunk.length + part.length > maxChars) {
          chunks.push(currentChunk.trim());
          currentChunk = part;
        } else {
          currentChunk += (currentChunk ? " " : "") + part;
        }
      }
      continue;
    }

    // Check if adding this sentence would exceed the limit
    if (currentChunk.length + sentence.length + 1 > maxChars) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Synthesize a single text chunk to audio
 */
async function synthesizeChunk(
  client: TextToSpeechClient,
  text: string,
  voiceName: string,
  languageCode: string
): Promise<Buffer> {
  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode,
      name: voiceName,
    },
    audioConfig: {
      audioEncoding: AUDIO_ENCODING,
    },
  });

  if (!response.audioContent) {
    throw new Error("No audio content received from TTS API");
  }

  // audioContent can be string or Uint8Array
  if (typeof response.audioContent === "string") {
    return Buffer.from(response.audioContent, "base64");
  }

  return Buffer.from(response.audioContent);
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
}

/**
 * Generate audio for an article
 * Handles chunking, synthesis, concatenation, and blob upload
 */
export async function generateAudioForArticle(
  articleId: string,
  htmlContent: string
): Promise<GenerateAudioResult> {
  // Check if Blob token is available
  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required for audio storage");
  }

  const client = getTTSClient();
  const voiceName = process.env.TTS_VOICE_NAME ?? "en-US-Standard-A";
  const languageCode = process.env.TTS_VOICE_LANGUAGE ?? "en-US";

  // Convert HTML to plain text
  const plainText = stripHtmlToPlainText(htmlContent);

  if (!plainText.trim()) {
    throw new Error("Article content is empty after HTML processing");
  }

  // Split into chunks
  const chunks = chunkText(plainText);

  // Synthesize each chunk
  const audioBuffers: Buffer[] = [];
  for (const chunk of chunks) {
    const buffer = await synthesizeChunk(client, chunk, voiceName, languageCode);
    audioBuffers.push(buffer);
  }

  // Concatenate all audio
  const finalAudio = concatenateAudioBuffers(audioBuffers);

  // Upload to Vercel Blob
  const filename = `article-audio/${articleId}.mp3`;
  const blob = await put(filename, finalAudio, {
    access: "public",
    contentType: AUDIO_CONTENT_TYPE,
  });

  return {
    audioUrl: blob.url,
    durationSeconds: estimateAudioDuration(finalAudio),
    fileSizeBytes: finalAudio.length,
    voiceName,
  };
}

/**
 * Delete audio from Vercel Blob
 */
export async function deleteAudioFromBlob(audioUrl: string): Promise<void> {
  await del(audioUrl);
}
