import { speechifyInput } from "../audio-usage/metering";
import { z } from "zod";
import {
  type Adapter,
  type Descriptor,
  type SpeechInput,
  type Voice,
  SourceAlignment,
  SpeechFault,
  lines,
  pcm,
} from "./protocol";

const speechifyChunk = z.object({
  audio: z.string().optional(),
  speech_marks: z
    .array(
      z.object({
        type: z.string(),
        value: z.string(),
        start_time: z.number(),
        end_time: z.number(),
      }),
    )
    .optional(),
});
const inworldChunk = z.object({
  error: z.unknown().optional(),
  result: z
    .object({
      audioContent: z.string().optional(),
      usage: z
        .object({
          processedCharactersCount: z.number().int().nonnegative().optional(),
        })
        .optional(),
      timestampInfo: z
        .object({
          wordAlignment: z
            .object({
              words: z.array(z.string()),
              wordStartTimeSeconds: z.array(z.number()),
              wordEndTimeSeconds: z.array(z.number()),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});
export function voices(provider: Descriptor["provider"]): Voice[] {
  const names =
    provider === "speechify"
      ? [
          ["geffen_32", "Geffen"],
          ["alicia", "Alicia"],
          ["alfonso", "Alfonso"],
          ["beth", "Beth"],
        ]
      : [
          ["Dennis", "Dennis"],
          ["Ashley", "Ashley"],
          ["Craig", "Craig"],
        ];
  return names.map(([id, name]) => ({
    id: `${provider}:${id!}`,
    name: `${name!} · ${provider === "speechify" ? "Speechify" : "Inworld"}`,
    language: "en-US",
    descriptor: {
      provider,
      model: provider === "speechify" ? "simba-3.2" : "inworld-tts-2-flash",
      voice: id!,
      language: "en-US",
      normalization: provider === "speechify" ? "provider" : "off",
      synthesisRate: 1,
    },
  }));
}
export function providerAdapter(
  provider: Descriptor["provider"],
  key: string,
  fetcher: typeof fetch = fetch,
): Adapter {
  return {
    voices: voices(provider),
    async *stream(input: SpeechInput, signal: AbortSignal) {
      const { text, descriptor: d } = input;
      const alignment = new SourceAlignment(text);
      const response = await fetcher(
        provider === "speechify"
          ? "https://api.speechify.ai/v1/audio/stream/with-timestamps"
          : "https://api.inworld.ai/tts/v1/voice:stream",
        {
          method: "POST",
          signal,
          headers: {
            Authorization: `${provider === "speechify" ? "Bearer" : "Basic"} ${key}`,
            "Content-Type": "application/json",
            ...(provider === "speechify"
              ? { "Speechify-Version": "2026-09-21" }
              : {}),
            Accept: provider === "speechify" ? "audio/pcm" : "application/json",
          },
          body: JSON.stringify(
            provider === "speechify"
              ? {
                  input: speechifyInput(text),
                  voice_id: d.voice,
                  model: d.model,
                  output_format: "pcm_24000",
                  language: d.language,
                }
              : {
                  text,
                  voiceId: d.voice,
                  modelId: d.model,
                  language: d.language,
                  audioConfig: {
                    audioEncoding: "PCM",
                    sampleRateHertz: 24000,
                    speakingRate: 1,
                  },
                  timestampType: "WORD",
                  timestampTransportStrategy: "ASYNC",
                  applyTextNormalization: "OFF",
                },
          ),
        },
      );
      if (!response.ok || !response.body)
        throw new SpeechFault(
          "provider_unavailable",
          `Speech provider returned HTTP ${response.status}.`,
        );
      let lastMarkEnd = 0;
      let bytes = 0,
        billed: number | undefined,
        done = false,
        event = "";
      let sseData: string[] = [];
      const decodeSpeechify = (name: string, raw: string) => {
        if (name === "speech.error")
          throw new SpeechFault(
            "provider_error",
            "Speech generation failed. Please retry.",
          );
        if (name === "speech.done") {
          done = true;
          const end = z
            .object({
              billable_characters_count: z
                .number()
                .int()
                .nonnegative()
                .optional(),
            })
            .parse(JSON.parse(raw));
          billed = end.billable_characters_count;
          return undefined;
        }
        if (name !== "speech.chunk") return undefined;
        return speechifyChunk.parse(JSON.parse(raw));
      };
      for await (const line of lines(response.body, signal)) {
        let audio: string | undefined;
        let marks: ReturnType<SourceAlignment["word"]>[] = [];
        if (provider === "speechify") {
          if (line.startsWith("event:")) {
            event = line.slice(6).trim();
            continue;
          }
          if (line.startsWith("data:")) {
            sseData.push(line.slice(5).trimStart());
            continue;
          }
          if (line !== "" || !sseData.length) continue;
          const chunk = decodeSpeechify(event, sseData.join("\n"));
          sseData = [];
          // Checkpoint the report before another network read can fail.
          if (event === "speech.done" && billed !== undefined)
            yield { type: "usage", units: billed };
          audio = chunk?.audio;
          marks =
            chunk?.speech_marks
              ?.filter((m) => m.type === "word")
              .map((m) =>
                alignment.word(m.value, m.start_time / 1000, m.end_time / 1000),
              ) ?? [];
        } else {
          if (!line.trim()) continue;
          const chunk = inworldChunk.parse(JSON.parse(line));
          if (chunk.error || !chunk.result)
            throw new SpeechFault(
              "provider_error",
              "Speech generation failed. Please retry.",
            );
          audio = chunk.result.audioContent;
          const units = chunk.result.usage?.processedCharactersCount;
          if (units !== undefined) billed = (billed ?? 0) + units;
          if (billed !== undefined) yield { type: "usage", units: billed };
          const words = chunk.result.timestampInfo?.wordAlignment;
          if (words)
            marks = words.words.map((word, i) =>
              alignment.word(
                word,
                words.wordStartTimeSeconds[i] ?? NaN,
                words.wordEndTimeSeconds[i] ?? NaN,
              ),
            );
        }
        if (audio) {
          bytes += pcm(audio).length;
          if (bytes > 20_000_000)
            throw new SpeechFault(
              "audio_too_large",
              "Speech audio exceeded its size limit.",
            );
          yield { type: "audio", data: audio };
        }
        const valid = marks.filter((m) => m !== undefined);
        if (valid.length) {
          lastMarkEnd = valid.at(-1)!.end;
          yield { type: "marks", marks: valid };
        }
      }
      // SSE can omit its final blank line.
      if (provider === "speechify" && sseData.length) {
        decodeSpeechify(event, sseData.join("\n"));
        if (event === "speech.done" && billed !== undefined)
          yield { type: "usage", units: billed };
      }
      if (
        (provider === "speechify" && !done) ||
        bytes === 0 ||
        bytes % 2 !== 0 ||
        lastMarkEnd > bytes / 48000
      )
        throw new SpeechFault(
          "incomplete_audio",
          "Speech stream ended before completion.",
        );
      yield {
        type: "audioComplete",
        duration: bytes / 48000,
        billableCharacters: billed ?? text.length,
      };
    },
  };
}
