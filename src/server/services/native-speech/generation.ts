import {
  type Adapter,
  type Event,
  type SpeechInput,
  SpeechFault,
  frame,
} from "./protocol";
import { type ArtifactStore } from "./cache";

/** Subscriber lifetime is independent of the admitted, already-billable generation. */
export async function generateArtifact(
  input: SpeechInput,
  id: string,
  fence: string,
  adapter: Adapter,
  store: ArtifactStore,
  emit: (event: Event) => void,
) {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 120_000);
  const renewal = setInterval(() => {
    void store
      .renew(id, fence)
      .then((owned) => {
        if (!owned) abort.abort();
      })
      .catch(() => abort.abort());
  }, 30_000);
  const started = performance.now();
  let firstAudio = false;
  let raw = "",
    complete = false;
  const send = (event: Event) => {
    raw += frame(event);
    emit(event);
  };
  try {
    send({
      type: "start",
      id,
      descriptor: input.descriptor,
      sampleRate: 24000,
      channels: 1,
      encoding: "pcm_s16le",
      cached: false,
    });
    for await (const event of adapter.stream(input, abort.signal)) {
      if (event.type === "audio" && !firstAudio) {
        firstAudio = true;
        console.info("native_speech", {
          id,
          provider: input.descriptor.provider,
          model: input.descriptor.model,
          event: "first_audio",
          milliseconds: Math.round(performance.now() - started),
        });
      }
      if (event.type === "audioComplete")
        console.info("native_speech", {
          id,
          provider: input.descriptor.provider,
          event: "audio_complete",
          inputCharacters: input.text.length,
          billableCharacters: event.billableCharacters,
          milliseconds: Math.round(performance.now() - started),
        });
      if (complete)
        throw new SpeechFault(
          "invalid_stream",
          "Speech provider emitted data after completion.",
        );
      send(event);
      if (event.type === "audioComplete") complete = true;
    }
    if (!complete)
      throw new SpeechFault(
        "incomplete_audio",
        "Speech generation did not complete.",
      );
    // Render EOF has already reached the client. Persistence cannot hold playback hostage.
    const saved = await store.save(id, fence, raw);
    emit({ type: "archive", id, state: saved ? "stored" : "failed" });
  } catch (error) {
    await store.fail(id, fence).catch(() => undefined);
    if (complete) emit({ type: "archive", id, state: "failed" });
    else
      emit({
        type: "error",
        code: error instanceof SpeechFault ? error.code : "generation_failed",
        message:
          error instanceof SpeechFault
            ? error.message
            : "Speech generation failed. Please retry.",
      });
  } finally {
    clearInterval(renewal);
    clearTimeout(timeout);
  }
}
