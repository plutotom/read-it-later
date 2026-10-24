import { z } from "zod";

export const SAMPLE_RATE = 24000;
export const MAX_AUDIO_BYTES = 8_000_000;
export const providerSchema = z.enum(["google", "speechify", "inworld"]);
export const voiceSchema = z.object({
  id: z.string().min(1).max(180),
  provider: providerSchema,
  name: z.string(),
  model: z.string(),
  wordTimings: z.boolean(),
});
export type ListeningVoice = z.infer<typeof voiceSchema>;
export const catalogSchema = z.object({
  enabled: z.boolean(),
  voices: z.array(voiceSchema),
  defaultVoice: z.string().nullable(),
});
export type ListeningCatalog = z.infer<typeof catalogSchema>;
export const markSchema = z.object({
  offset: z.number().int().nonnegative(),
  length: z.number().int().positive(),
  start: z.number().finite().nonnegative(),
  end: z.number().finite().positive(),
});
export type WordMark = z.infer<typeof markSchema>;
export const eventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start"),
    requestId: z.string(),
    cached: z.boolean(),
    sampleRate: z.literal(24000),
    voiceId: z.string(),
  }),
  z.object({ type: z.literal("audio"), data: z.string().max(12_000_000) }),
  z.object({ type: z.literal("marks"), marks: z.array(markSchema).max(4000) }),
  z.object({
    type: z.literal("complete"),
    duration: z.number().finite().positive(),
  }),
  z.object({ type: z.literal("archive"), state: z.enum(["stored", "failed"]) }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ListeningEvent = z.infer<typeof eventSchema>;
export type ProviderEvent = Exclude<
  ListeningEvent,
  { type: "start" | "error" | "archive" }
>;
export type MeteredProviderEvent =
  | ProviderEvent
  | { type: "usage"; units: number };
export const streamRequestSchema = z.object({
  regenerate: z.boolean().optional(),
  articleId: z.string().uuid(),
  revision: z.string().min(1).max(64),
  segment: z.number().int().min(0).max(100_000),
  voiceId: z.string().min(1).max(180),
});
export type StreamRequest = z.infer<typeof streamRequestSchema>;
export const encodeEvent = (event: ListeningEvent) =>
  JSON.stringify(event) + "\n";

/** HTTP chunks are arbitrary byte boundaries, not NDJSON frames. */
export async function* readEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<ListeningEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  let pending = "";
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      pending += decoder.decode(value, { stream: !done });
      let end: number;
      while ((end = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, end).trim();
        pending = pending.slice(end + 1);
        if (line.length > 12_000_000)
          throw new Error("Speech frame is too large.");
        if (line) yield eventSchema.parse(JSON.parse(line));
      }
      if (pending.length > 12_000_000)
        throw new Error("Speech frame is too large.");
      if (done) break;
    }
    if (pending.trim()) yield eventSchema.parse(JSON.parse(pending));
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
