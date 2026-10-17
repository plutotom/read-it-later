import { createHash } from "node:crypto";
import { z } from "zod";

export const descriptorSchema = z.object({
  provider: z.enum(["speechify", "inworld"]),
  model: z.string().min(1).max(80),
  voice: z.string().min(1).max(160),
  language: z.literal("en-US"),
  normalization: z.enum(["provider", "off"]),
  synthesisRate: z.literal(1),
});
export type Descriptor = z.infer<typeof descriptorSchema>;
export const requestSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(2000)
    .refine((s) => s.trim().length > 0 && !/[\u0000-\u0008]/u.test(s)),
  descriptor: descriptorSchema,
});
export type SpeechInput = z.infer<typeof requestSchema>;
export interface Mark {
  offset: number;
  length: number;
  start: number;
  end: number;
}
export type Event =
  | {
      type: "start";
      id: string;
      descriptor: Descriptor;
      sampleRate: 24000;
      channels: 1;
      encoding: "pcm_s16le";
      cached: boolean;
    }
  | { type: "audio"; data: string }
  | { type: "marks"; marks: Mark[] }
  | { type: "audioComplete"; duration: number; billableCharacters: number }
  | { type: "archive"; state: "stored" | "failed"; id: string }
  | { type: "error"; code: string; message: string };
export type ProviderEvent = Exclude<
  Event,
  { type: "start" | "archive" | "error" }
>;
export interface Voice {
  id: string;
  name: string;
  language: string;
  descriptor: Descriptor;
}
export interface Adapter {
  voices: Voice[];
  stream(
    input: SpeechInput,
    signal: AbortSignal,
  ): AsyncGenerator<ProviderEvent>;
}
export class SpeechFault extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export function identity(input: SpeechInput, namespace = "prototype"): string {
  const d = input.descriptor;
  // Catalog versions, protocol framing and storage encoding are deliberately absent.
  return createHash("sha256")
    .update(
      JSON.stringify([
        namespace,
        input.text,
        d.provider,
        d.model,
        d.voice,
        d.language,
        d.normalization,
        d.synthesisRate,
      ]),
    )
    .digest("hex");
}
export const frame = (event: Event) => JSON.stringify(event) + "\n";

/** HTTP read boundaries never delimit provider messages. */
export async function* lines(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "";
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      if (pending.length > 4_000_000)
        throw new SpeechFault(
          "invalid_stream",
          "Speech stream exceeded its frame limit.",
        );
      let end: number;
      while ((end = pending.indexOf("\n")) >= 0) {
        yield pending.slice(0, end).replace(/\r$/, "");
        pending = pending.slice(end + 1);
      }
      if (done) break;
    }
    if (pending.trim()) yield pending;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
export function pcm(value: string): Buffer {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    throw new SpeechFault("invalid_audio", "Invalid speech audio.");
  return Buffer.from(value, "base64");
}

/** Conservative monotonic alignment. A mismatch stops word highlighting rather than guessing. */
export class SourceAlignment {
  private cursor = 0;
  private lastTime = 0;
  private stopped = false;
  constructor(private text: string) {}
  word(word: string, start: number, end: number): Mark | undefined {
    if (this.stopped || !word.trim()) return;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < this.lastTime ||
      end <= start
    ) {
      this.stopped = true;
      return;
    }
    const fold = (s: string) =>
      s
        .normalize("NFKC")
        .toLocaleLowerCase("en-US")
        .replace(/[^\p{L}\p{N}\p{M}]/gu, "");
    // Only skip punctuation/whitespace. Never skip an unmatched source word.
    const rest = this.text.slice(this.cursor);
    const match = /[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{N}\p{M}]+)*/u.exec(rest);
    if (!match || fold(match[0]) !== fold(word)) {
      this.stopped = true;
      return;
    }
    const offset = this.cursor + match.index;
    this.cursor = offset + match[0].length;
    this.lastTime = end;
    return { offset, length: match[0].length, start, end };
  }
}
