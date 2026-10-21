import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("../google-tts-client", () => ({ getGoogleTTSClient: mocks.client }));
vi.mock("~/env", () => ({
  env: {
    TTS_VOICE_NAME: "en-US-Chirp3-HD-Charon",
    SPEECHIFY_API_KEY: "test-key",
    INWORLD_API_KEY: "test-key",
  },
}));
import {
  defaultListeningVoice,
  googleProvider,
  listeningVoices,
} from "./providers";

describe("Google streaming adapter", () => {
  it("sends configuration first, streams PCM incrementally and cleans up its client", async () => {
    const stream = {
      write: vi.fn(),
      end: vi.fn(),
      cancel: vi.fn(),
      async *[Symbol.asyncIterator]() {
        yield { audioContent: Buffer.alloc(24000) };
        yield { audioContent: Buffer.alloc(24000) };
      },
    };
    const close = vi.fn();
    mocks.client.mockReturnValue({ streamingSynthesize: () => stream, close });
    const voice = listeningVoices()[0]!;
    const events = [];
    for await (const event of googleProvider.stream(
      "Hello world.",
      voice,
      new AbortController().signal,
    ))
      events.push(event);
    expect(stream.write.mock.calls[0]![0]).toMatchObject({
      streamingConfig: {
        voice: { name: "en-US-Chirp3-HD-Charon" },
        streamingAudioConfig: { audioEncoding: "PCM", sampleRateHertz: 24000 },
      },
    });
    expect(stream.write.mock.calls[1]![0]).toEqual({
      input: { text: "Hello world." },
    });
    expect(events.map((e) => e.type)).toEqual(["audio", "audio", "complete"]);
    expect(events.at(-1)).toEqual({ type: "complete", duration: 1 });
    expect(stream.cancel).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
  it("exposes configured providers through one catalog with Google as the default", () => {
    const catalog = listeningVoices();
    expect(new Set(catalog.map((v) => v.provider))).toEqual(
      new Set(["google", "speechify", "inworld"]),
    );
    expect(defaultListeningVoice(catalog)).toBe(
      "google:en-US-Chirp3-HD-Charon",
    );
    expect(
      catalog
        .filter((v) => v.provider !== "google")
        .every((v) => v.wordTimings),
    ).toBe(true);
    expect(defaultListeningVoice(catalog, "en-US-Standard-A")).toBe(
      "google:en-US-Chirp3-HD-Charon",
    );
  });
});
