import { TextToSpeechClient } from "@google-cloud/text-to-speech";

/** Both file synthesis and streaming use the same server-only credentials. */
export function getGoogleTTSClient(): TextToSpeechClient {
  const raw = process.env.GOOGLE_CLOUD_TTS_CREDENTIALS;
  if (!raw) return new TextToSpeechClient();
  try {
    return new TextToSpeechClient({ credentials: JSON.parse(raw) as object });
  } catch {
    throw new Error("Invalid GOOGLE_CLOUD_TTS_CREDENTIALS JSON format");
  }
}
