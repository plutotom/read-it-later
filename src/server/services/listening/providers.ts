import type { PreparedSpeech } from "../audio-usage/metering";
import type { google } from "@google-cloud/text-to-speech/build/protos/protos";
import { env } from "~/env";
import { DEFAULT_VOICE, TTS_VOICE_OPTIONS } from "~/lib/tts-voices";
import {
  MAX_AUDIO_BYTES,
  SAMPLE_RATE,
  type ListeningVoice,
  type MeteredProviderEvent,
} from "~/lib/listening/protocol";
import { getGoogleTTSClient } from "../google-tts-client";
import { providerAdapter, voices } from "../native-speech/providers";
import { SpeechFault } from "../native-speech/protocol";

/** Provider-specific SDKs, models and credentials never cross this boundary. */
export interface ListeningProvider {
  stream(
    text: string,
    voice: ListeningVoice,
    signal: AbortSignal,
    prepared?: PreparedSpeech,
  ): AsyncGenerator<MeteredProviderEvent>;
}

export function listeningVoices(): ListeningVoice[] {
  const google: ListeningVoice[] = TTS_VOICE_OPTIONS.filter(
    (v) => v.tier === "chirp3",
  ).map((v) => ({
    id: "google:" + v.name,
    provider: "google",
    name: v.label + " · Google",
    model: "chirp3-hd-pcm24-v1",
    wordTimings: false,
  }));
  return [
    ...google,
    ...(["speechify", "inworld"] as const).flatMap((provider) => {
      if (
        !(provider === "speechify"
          ? env.SPEECHIFY_API_KEY
          : env.INWORLD_API_KEY)
      )
        return [];
      return voices(provider).map((v) => ({
        id: v.id,
        provider,
        name: v.name,
        model: v.descriptor.model,
        wordTimings: true,
      }));
    }),
  ];
}
export function defaultListeningVoice(
  available: ListeningVoice[],
  preferred?: string | null,
) {
  return (
    available.find(
      (v) => v.id === "google:" + (preferred ?? env.TTS_VOICE_NAME),
    )?.id ??
    available.find((v) => v.id === "google:" + DEFAULT_VOICE)?.id ??
    available[0]?.id ??
    null
  );
}

export const googleProvider: ListeningProvider = {
  async *stream(text, voice, signal, prepared) {
    signal.throwIfAborted();
    const client = getGoogleTTSClient();
    const stream = client.streamingSynthesize({ timeout: 90_000, retry: null });
    const cancel = () => stream.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    let bytes = 0;
    try {
      stream.write({
        streamingConfig: {
          voice: {
            name: voice.id.slice("google:".length),
            languageCode: "en-US",
          },
          streamingAudioConfig: {
            audioEncoding: "PCM",
            sampleRateHertz: SAMPLE_RATE,
          },
        },
      });
      // Short sentences also avoid Chirp's limit on an unpunctuated run.
      const { enforceMaxSentenceLength } = await import("../tts-text");
      stream.write({
        input: { text: prepared?.submitted ?? enforceMaxSentenceLength(text) },
      });
      stream.end();
      for await (const raw of stream) {
        signal.throwIfAborted();
        const result =
          raw as google.cloud.texttospeech.v1.IStreamingSynthesizeResponse;
        if (!result.audioContent) continue;
        const data =
          typeof result.audioContent === "string"
            ? Buffer.from(result.audioContent, "base64")
            : Buffer.from(result.audioContent);
        bytes += data.length;
        if (bytes > MAX_AUDIO_BYTES)
          throw new SpeechFault(
            "audio_too_large",
            "The speech segment exceeded its audio limit.",
          );
        if (data.length) yield { type: "audio", data: data.toString("base64") };
      }
      signal.throwIfAborted();
      if (!bytes || bytes % 2)
        throw new SpeechFault(
          "incomplete_audio",
          "Speech ended before a complete segment was received.",
        );
      yield { type: "complete", duration: bytes / (SAMPLE_RATE * 2) };
    } finally {
      signal.removeEventListener("abort", cancel);
      stream.cancel();
      await client.close().catch(() => undefined);
    }
  },
};

export function resolveProvider(voice: ListeningVoice): ListeningProvider {
  if (voice.provider === "google") return googleProvider;
  const provider = voice.provider;
  const native = voices(provider).find((v) => v.id === voice.id);
  const key =
    provider === "speechify" ? env.SPEECHIFY_API_KEY : env.INWORLD_API_KEY;
  if (!native || !key)
    throw new SpeechFault(
      "voice_unavailable",
      "This voice is unavailable. Choose another voice.",
      409,
    );
  return {
    async *stream(text, _voice, signal) {
      for await (const event of providerAdapter(provider, key).stream(
        { text, descriptor: native.descriptor },
        signal,
      )) {
        if (event.type === "audioComplete")
          yield { type: "complete", duration: event.duration };
        else yield event;
      }
    },
  };
}
