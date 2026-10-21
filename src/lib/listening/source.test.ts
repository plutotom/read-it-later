import { describe, expect, it, vi } from "vitest";
import { HttpSpeechSource } from "./source";
import { encodeEvent, type ListeningEvent } from "./protocol";

const request = {
  articleId: "a",
  revision: "r",
  segment: 0,
  voiceId: "google:test",
};
const start: ListeningEvent = {
  type: "start",
  requestId: "request",
  cached: false,
  sampleRate: 24000,
  voiceId: request.voiceId,
};
const audio: ListeningEvent = {
  type: "audio",
  data: Buffer.alloc(48000).toString("base64"),
};
function response(events: ListeningEvent[], fragmented = false) {
  const bytes = new TextEncoder().encode(events.map(encodeEvent).join(""));
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += fragmented ? 17 : bytes.length)
          controller.enqueue(
            bytes.slice(i, i + (fragmented ? 17 : bytes.length)),
          );
        controller.close();
      },
    }),
    { headers: { "Content-Type": "application/x-ndjson" } },
  );
}
async function collect(events: ListeningEvent[]) {
  const source = new HttpSpeechSource(vi.fn(async () => response(events)));
  const values = [];
  for await (const event of source.stream(
    request,
    new AbortController().signal,
  ))
    values.push(event);
  return values;
}
describe("browser speech source", () => {
  it("preserves the browser fetch receiver", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(
        response([start, audio, { type: "complete", duration: 1 }]),
      );
    };
    try {
      for await (const event of new HttpSpeechSource().stream(
        request,
        new AbortController().signal,
      ))
        expect(event.type).toBeTruthy();
    } finally {
      globalThis.fetch = original;
    }
  });
  it("accepts arbitrary HTTP fragmentation and trailing marks", async () => {
    const source = new HttpSpeechSource(
      vi.fn(async () =>
        response(
          [
            start,
            audio,
            {
              type: "marks",
              marks: [{ offset: 0, length: 1, start: 0, end: 0.5 }],
            },
            { type: "complete", duration: 1 },
          ],
          true,
        ),
      ),
    );
    const values = [];
    for await (const event of source.stream(
      request,
      new AbortController().signal,
    ))
      values.push(event);
    expect(values.map((v) => v.type)).toEqual(["audio", "marks", "complete"]);
  });
  it("rejects truncation, wrong voices, malformed base64, invalid duration and late errors", async () => {
    await expect(collect([start, audio])).rejects.toThrow("ended early");
    await expect(
      collect([{ ...start, voiceId: "wrong" }, audio]),
    ).rejects.toThrow("requested voice");
    await expect(
      collect([start, { type: "audio", data: "!invalid!" }]),
    ).rejects.toThrow("Invalid speech audio");
    await expect(
      collect([start, audio, { type: "complete", duration: 2 }]),
    ).rejects.toThrow("complete segment");
    await expect(
      collect([
        start,
        audio,
        { type: "error", code: "failed", message: "Retry this passage." },
      ]),
    ).rejects.toThrow("Retry this passage");
  });
  it("cancels a stalled reader immediately when seeking elsewhere", async () => {
    const cancel = vi.fn();
    const source = new HttpSpeechSource(
      vi.fn(
        async () =>
          new Response(new ReadableStream({ cancel }), {
            headers: { "Content-Type": "application/x-ndjson" },
          }),
      ),
    );
    const abort = new AbortController();
    const reading = source.stream(request, abort.signal).next();
    await Promise.resolve();
    await Promise.resolve();
    abort.abort();
    await expect(reading).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });
});
