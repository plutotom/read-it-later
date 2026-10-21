import {
  MAX_AUDIO_BYTES,
  SAMPLE_RATE,
  readEvents,
  type StreamRequest,
  type WordMark,
} from "./protocol";

export type SpeechPacket =
  | { type: "audio"; data: Uint8Array }
  | { type: "marks"; marks: WordMark[] }
  | { type: "complete"; duration: number };
export interface SpeechSource {
  stream(
    request: StreamRequest,
    signal: AbortSignal,
  ): AsyncGenerator<SpeechPacket>;
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException("Speech request canceled", "AbortError"),
      );
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Retries only admission waits; never replay an interrupted stream implicitly. */
export class HttpSpeechSource implements SpeechSource {
  constructor(
    private fetcher: typeof fetch = (...args) => globalThis.fetch(...args),
  ) {}
  async *stream(
    request: StreamRequest,
    signal: AbortSignal,
  ): AsyncGenerator<SpeechPacket> {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 90; attempt++) {
      signal.throwIfAborted();
      response = await this.fetcher("/api/listening/stream", {
        method: "POST",
        credentials: "same-origin",
        signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify(request),
      });
      if (response.status !== 202) break;
      await response.body?.cancel();
      await delay(1000, signal);
    }
    if (!response || response.status === 202)
      throw new Error(
        "This passage is still being prepared. Retry in a moment.",
      );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      throw new Error(
        typeof body?.message === "string"
          ? body.message
          : "Could not connect to the speech service.",
      );
    }
    if (
      !response.body ||
      !response.headers.get("content-type")?.startsWith("application/x-ndjson")
    )
      throw new Error("The speech service returned an unexpected response.");
    let started = false,
      bytes = 0,
      lastMarkEnd = 0;
    for await (const event of readEvents(response.body, signal)) {
      if (event.type === "error") throw new Error(event.message);
      if (event.type === "start") {
        if (started || event.voiceId !== request.voiceId)
          throw new Error(
            "Speech configuration did not match the requested voice.",
          );
        started = true;
        continue;
      }
      if (!started)
        throw new Error("Speech arrived without its configuration.");
      if (event.type === "audio") {
        if (
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            event.data,
          )
        )
          throw new Error("Invalid speech audio.");
        const data = Uint8Array.from(atob(event.data), (c) => c.charCodeAt(0));
        bytes += data.length;
        if (bytes > MAX_AUDIO_BYTES)
          throw new Error("Speech exceeded its audio limit.");
        if (data.length) yield { type: "audio", data };
      } else if (event.type === "marks") {
        for (const mark of event.marks) {
          if (mark.start < lastMarkEnd || mark.end <= mark.start)
            throw new Error("Invalid speech timestamps.");
          lastMarkEnd = mark.end;
        }
        yield event;
      } else {
        if (
          !bytes ||
          bytes % 2 ||
          Math.abs(event.duration - bytes / (SAMPLE_RATE * 2)) > 0.001 ||
          lastMarkEnd > event.duration + 0.05
        )
          throw new Error(
            "Speech ended before a complete segment was received.",
          );
        yield event;
        return;
      }
    }
    throw new Error("The speech connection ended early. Retry this paragraph.");
  }
}
