import { describe, expect, it } from "vitest";
import { providerAdapter, voices } from "./providers";
import {
  identity,
  requestSchema,
  SourceAlignment,
  type Event,
  type SpeechInput,
} from "./protocol";
import { generateArtifact } from "./generation";
import type { ArtifactStore } from "./cache";

const input: SpeechInput = {
  text: "Hello world",
  descriptor: voices("speechify")[0]!.descriptor,
};
function fetchStream(text: string, pieces = 3): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(c) {
            const encoded = new TextEncoder().encode(text);
            for (let i = 0; i < encoded.length; i += pieces)
              c.enqueue(encoded.slice(i, i + pieces));
            c.close();
          },
        }),
      ),
    )) as typeof fetch;
}
const collect = async (
  provider: "speechify" | "inworld",
  text: string,
  request = input,
) => {
  const result = [];
  for await (const event of providerAdapter(
    provider,
    "private-key",
    fetchStream(text),
  ).stream(request, new AbortController().signal))
    result.push(event);
  return result;
};
describe("native provider boundary", () => {
  it("parses fragmented Speechify SSE and normalizes milliseconds", async () => {
    const audio = Buffer.alloc(48000).toString("base64");
    const events = await collect(
      "speechify",
      `event: speech.chunk\r\ndata: ${JSON.stringify({ audio, speech_marks: [{ type: "word", value: "Hello", start_time: 0, end_time: 450 }] })}\r\n\r\nevent: speech.done\ndata: {"billable_characters_count":11}\n\n`,
    );
    expect(events.map((e) => e.type)).toEqual([
      "audio",
      "marks",
      "usage",
      "audioComplete",
    ]);
    expect(events[1]).toEqual({
      type: "marks",
      marks: [{ offset: 0, length: 5, start: 0, end: 0.45 }],
    });
    expect(events.at(-1)).toEqual({
      type: "audioComplete",
      duration: 1,
      billableCharacters: 11,
    });
  });
  it("rejects HTTP-200 provider errors and truncated audio", async () => {
    await expect(
      collect("speechify", "event: speech.error\ndata: {}\n\n"),
    ).rejects.toThrow("Speech generation failed");
    await expect(
      collect("speechify", 'event: speech.chunk\ndata: {"audio":"AA=="}\n\n'),
    ).rejects.toThrow("before completion");
    await expect(
      collect("inworld", '{"error":{"message":"secret upstream detail"}}\n'),
    ).rejects.toThrow("Speech generation failed");
  });
  it("supports Inworld timestamp-only messages without resetting the timeline", async () => {
    const result = await collect(
      "inworld",
      JSON.stringify({
        result: {
          audioContent: Buffer.alloc(48000).toString("base64"),
          usage: { processedCharactersCount: 11 },
        },
      }) +
        "\n" +
        JSON.stringify({
          result: {
            timestampInfo: {
              wordAlignment: {
                words: ["Hello", "world"],
                wordStartTimeSeconds: [0, 0.5],
                wordEndTimeSeconds: [0.4, 0.9],
              },
            },
          },
        }),
      { ...input, descriptor: voices("inworld")[0]!.descriptor },
    );
    expect(result.find((event) => event.type === "marks")).toEqual({
      type: "marks",
      marks: [
        { offset: 0, length: 5, start: 0, end: 0.4 },
        { offset: 6, length: 5, start: 0.5, end: 0.9 },
      ],
    });
  });
  it("preserves explicit zero and retains first Inworld HTTP usage through zero-valued later chunks", async () => {
    const audio = Buffer.alloc(48).toString("base64");
    const zero = await collect(
      "speechify",
      `event: speech.chunk\ndata: ${JSON.stringify({ audio })}\n\nevent: speech.done\ndata: {"billable_characters_count":0}\n\n`,
    );
    expect(zero.find((e) => e.type === "usage")).toEqual({
      type: "usage",
      units: 0,
    });
    expect(zero.at(-1)).toMatchObject({ billableCharacters: 0 });
    const result = await collect(
      "inworld",
      JSON.stringify({
        result: {
          audioContent: audio,
          usage: { processedCharactersCount: 11 },
        },
      }) +
        "\n" +
        JSON.stringify({
          result: {
            audioContent: audio,
            usage: { processedCharactersCount: 0 },
          },
        }),
      { ...input, descriptor: voices("inworld")[0]!.descriptor },
    );
    expect(result.at(-1)).toMatchObject({ billableCharacters: 11 });
    expect(
      result.filter((e) => e.type === "usage").map((e) => e.units),
    ).toEqual([11, 11]);
  });
  it("maps repeated words and Unicode to original UTF-16; expansions fall back conservatively", () => {
    const align = new SourceAlignment("🌍 café café $12 on Oct. 16");
    expect(align.word("café", 0, 0.3)?.offset).toBe(3);
    expect(align.word("café", 0.3, 0.6)?.offset).toBe(8);
    expect(align.word("twelve", 0.6, 0.8)).toBeUndefined();
    expect(align.word("on", 0.8, 1)).toBeUndefined();
  });
  it("keys synthesis settings independently of catalogs and limits request input", () => {
    expect(identity(input)).toBe(
      identity({ ...input, descriptor: { ...input.descriptor } }),
    );
    expect(identity(input)).not.toBe(
      identity({
        ...input,
        descriptor: { ...input.descriptor, voice: "different" },
      }),
    );
    expect(
      requestSchema.safeParse({ ...input, text: "x".repeat(2001) }).success,
    ).toBe(false);
    expect(requestSchema.safeParse({ ...input, text: " " }).success).toBe(
      false,
    );
  });
  it("delivers audio EOF while saving remains blocked; subscribers do not own the job", async () => {
    let release!: (value: boolean) => void;
    const saved = new Promise<boolean>((r) => {
      release = r;
    });
    const events: Event[] = [];
    const store: ArtifactStore = {
      acquire: async () => true,
      renew: async () => true,
      status: async () => undefined,
      read: async () => undefined,
      save: () => saved,
      fail: async () => undefined,
    };
    const adapter = {
      voices: [],
      async *stream() {
        yield { type: "audio" as const, data: "AAA=" };
        yield {
          type: "audioComplete" as const,
          duration: 1 / 24000,
          billableCharacters: 11,
        };
      },
    };
    const work = generateArtifact(
      input,
      "id",
      "fence",
      adapter,
      store,
      (event) => events.push(event),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(events.at(-1)?.type).toBe("audioComplete");
    release(true);
    await work;
    expect(events.at(-1)).toEqual({
      type: "archive",
      id: "id",
      state: "stored",
    });
  });
});
