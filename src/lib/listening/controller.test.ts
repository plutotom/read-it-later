import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { ListeningController } from "./controller";
import { createListeningDocument } from "./document";
import type { ListeningVoice, StreamRequest } from "./protocol";
import type { SpeechPacket, SpeechSource } from "./source";
import type { ListeningTransport } from "./transport";

const voice: ListeningVoice = {
  id: "google:Charon",
  provider: "google",
  name: "Charon",
  model: "test-v1",
  wordTimings: false,
};
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
class Transport implements ListeningTransport {
  onPosition: ListeningTransport["onPosition"] = null;
  onError: ListeningTransport["onError"] = null;
  unlock = vi.fn(async (): Promise<void> => undefined);
  reset = vi.fn();
  begin = vi.fn();
  append = vi.fn();
  finish = vi.fn();
  play = vi.fn();
  pause = vi.fn();
  setRate = vi.fn();
  dispose = vi.fn();
  render(segment: number, time: number, waiting = false, ended = false) {
    this.onPosition?.({ segment, time, waiting, ended });
  }
}
type Call = {
  request: StreamRequest;
  signal: AbortSignal;
  events: (SpeechPacket | Error)[];
  wake?: () => void;
};
class Source implements SpeechSource {
  calls: Call[] = [];
  async *stream(request: StreamRequest, signal: AbortSignal) {
    const call: Call = { request, signal, events: [] };
    this.calls.push(call);
    while (true) {
      if (!call.events.length)
        await new Promise<void>((resolve) => {
          call.wake = resolve;
        });
      const event = call.events.shift()!;
      if (event instanceof Error) throw event;
      yield event;
      if (event.type === "complete") return;
    }
  }
  emit(index: number | Call, event: SpeechPacket | Error) {
    const call =
      typeof index === "number"
        ? [...this.calls].reverse().find((c) => c.request.segment === index)!
        : index;
    call.events.push(event);
    call.wake?.();
  }
  complete(index: number) {
    this.emit(index, { type: "audio", data: new Uint8Array(48000) });
    this.emit(index, { type: "complete", duration: 1 });
  }
}
function setup(count = 6) {
  const document = createListeningDocument(
    new JSDOM(
      Array.from(
        { length: count },
        (_, i) => "<p>Paragraph " + i + " words.</p>",
      ).join(""),
    ).window.document.body,
  );
  const transport = new Transport(),
    source = new Source();
  const player = new ListeningController(
    "article",
    document,
    voice,
    source,
    transport,
  );
  return { player, transport, source, document };
}
describe("listening playback controller", () => {
  it.each([false, true])(
    "preserves playback and memory cache after missing archive ack (reset=%s)",
    async (reset) => {
      const { document } = setup(1);
      const transport = new Transport();
      const stream = vi.fn(async function* () {
        yield { type: "audio" as const, data: new Uint8Array(48000) };
        yield { type: "complete" as const, duration: 1 };
        if (reset) throw new Error("archive reset");
      });
      const player = new ListeningController(
        "article",
        document,
        voice,
        { stream },
        transport,
      );
      await player.playFrom(0);
      const pauses = transport.pause.mock.calls.length;
      await turn();
      transport.render(0, 0.2);
      expect(player.getSnapshot()).toMatchObject({
        state: "playing",
        wantsPlayback: true,
        error: null,
        cacheStatus: "failed",
      });
      expect(transport.pause).toHaveBeenCalledTimes(pauses);
      await player.playFrom(0);
      expect(stream).toHaveBeenCalledTimes(1);
      player.dispose();
    },
  );
  it("starts at the selected section, streams before EOF, and bounds lookahead", async () => {
    const { player, source, transport } = setup();
    await player.playFrom(2);
    expect(source.calls.map((c) => c.request.segment)).toEqual([2, 3, 4]);
    source.emit(2, { type: "audio", data: new Uint8Array([1, 2]) });
    await turn();
    expect(transport.append).toHaveBeenCalledWith(2, new Uint8Array([1, 2]));
    expect(transport.finish).not.toHaveBeenCalled();
    expect(player.getSnapshot().state).toBe("buffering");
    transport.render(2, 0.1);
    expect(player.getSnapshot().state).toBe("playing");
    transport.render(2, 0.1, true);
    expect(player.getSnapshot().state).toBe("buffering");
    player.dispose();
  });
  it("does not resume when audio arrives after pause or while unlocking", async () => {
    const { player, source, transport } = setup();
    let unlock!: () => void;
    transport.unlock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          unlock = resolve;
        }),
    );
    const starting = player.playFrom(1);
    player.pause();
    unlock();
    await starting;
    expect(source.calls).toHaveLength(0);
    expect(player.getSnapshot().state).toBe("paused");
    await player.resume();
    player.pause();
    const plays = transport.play.mock.calls.length;
    source.complete(1);
    await turn();
    expect(player.getSnapshot().state).toBe("paused");
    expect(transport.play).toHaveBeenCalledTimes(plays);
    transport.render(1, 0.5);
    expect(player.getSnapshot().state).toBe("paused");
    player.dispose();
  });
  it("rejects stale responses after a seek and a voice change", async () => {
    const { player, source, transport } = setup();
    await player.playFrom(0);
    const stale = source.calls[0]!;
    await player.playFrom(3);
    expect(stale.signal.aborted).toBe(true);
    transport.append.mockClear();
    source.emit(stale, { type: "audio", data: new Uint8Array([9, 9]) });
    await turn();
    expect(transport.append).not.toHaveBeenCalled();
    const priorVoice = [...source.calls]
      .reverse()
      .find((c) => c.request.segment === 3)!;
    player.setVoice({ ...voice, id: "google:Kore", name: "Kore" });
    await turn();
    source.emit(priorVoice, { type: "audio", data: new Uint8Array([8, 8]) });
    await turn();
    expect(player.getSnapshot().voice.id).toBe("google:Kore");
    expect(transport.append).not.toHaveBeenCalled();
    player.dispose();
  });
  it("moves a paused playhead without unlocking audio or generating speech until play", async () => {
    const { player, source, transport } = setup(1);
    const target = player.getSnapshot().duration / 2;
    player.seek(target);
    expect(player.getSnapshot()).toMatchObject({
      state: "paused",
      wantsPlayback: false,
      time: target,
    });
    expect(source.calls).toHaveLength(0);
    expect(transport.unlock).not.toHaveBeenCalled();
    await player.resume();
    expect(source.calls).toHaveLength(1);
    expect(transport.reset).toHaveBeenLastCalledWith(0, target);
    source.complete(0);
    await turn();
    transport.render(0, 0.5);
    player.pause();
    const starts = transport.play.mock.calls.length;
    player.seek(0.75);
    expect(player.getSnapshot()).toMatchObject({
      state: "paused",
      wantsPlayback: false,
      time: 0.75,
    });
    expect(source.calls).toHaveLength(1);
    expect(transport.play).toHaveBeenCalledTimes(starts);
    await player.resume();
    expect(transport.reset).toHaveBeenLastCalledWith(0, 0.75);
    expect(source.calls).toHaveLength(1);
    player.dispose();
  });
  it("holds lookahead audio until validated and maps marks using the rendered clock", async () => {
    const { player, source, transport, document } = setup();
    await player.playFrom(0);
    source.emit(1, { type: "audio", data: new Uint8Array([1, 2]) });
    await turn();
    expect(transport.append).not.toHaveBeenCalled();
    source.emit(0, {
      type: "marks",
      marks: [{ offset: 0, length: 9, start: 0.1, end: 0.8 }],
    });
    await turn();
    transport.render(0, 0.5);
    expect(player.getSnapshot().word).toEqual({
      start: document.paragraphs[0]!.start,
      end: document.paragraphs[0]!.start + 9,
    });
    transport.render(0, 0.9);
    expect(player.getSnapshot().word).toBeNull();
    source.emit(1, { type: "complete", duration: 1 });
    await turn();
    expect(transport.append).toHaveBeenCalledWith(1, new Uint8Array([1, 2]));
    expect(transport.finish).toHaveBeenCalledWith(1);
    player.dispose();
  });
  it("reuses completed audio without duplicate generation or duplicate queue writes", async () => {
    const { player, source, transport } = setup(1);
    await player.playFrom(0);
    source.complete(0);
    await turn();
    transport.render(0, 0.3);
    transport.render(0, 0.5);
    expect(transport.append).toHaveBeenCalledTimes(1);
    await player.playFrom(0);
    expect(source.calls).toHaveLength(1);
    expect(transport.append).toHaveBeenCalledTimes(2);
    expect(player.getSnapshot().estimated).toBe(false);
    transport.render(0, 1, false, true);
    expect(player.getSnapshot().state).toBe("finished");
    expect(player.getSnapshot().wantsPlayback).toBe(false);
    player.dispose();
  });
  it("defers a failed lookahead retry until it is current, and allows retry of active failures", async () => {
    const { player, source, transport } = setup(3);
    await player.playFrom(0);
    source.emit(1, new Error("lookahead failed"));
    await turn();
    transport.render(0, 0.2);
    transport.render(0, 0.4);
    expect(source.calls.filter((c) => c.request.segment === 1)).toHaveLength(1);
    transport.render(1, 0, true);
    await turn();
    expect(source.calls.filter((c) => c.request.segment === 1)).toHaveLength(2);
    source.emit(1, new Error("connection dropped"));
    await turn();
    expect(player.getSnapshot().state).toBe("error");
    expect(player.getSnapshot().error).toBe("connection dropped");
    await player.resume();
    expect(player.getSnapshot().state).toBe("buffering");
    player.dispose();
  });
  it("restores revision-bound bookmarks and rejects invalid speeds", () => {
    const { player, document } = setup();
    player.restore({
      revision: "changed",
      voiceId: voice.id,
      segment: 4,
      time: 1,
      rate: 1.5,
    });
    expect(player.getSnapshot().segment).toBe(0);
    player.restore({
      revision: document.revision,
      voiceId: voice.id,
      segment: 4,
      time: 1,
      rate: 1.5,
    });
    expect(player.getSnapshot()).toMatchObject({
      state: "idle",
      segment: 4,
      time: 1,
      rate: 1.5,
    });
    player.setRate(Infinity);
    player.setRate(0);
    expect(player.getSnapshot().rate).toBe(1.5);
    player.dispose();
  });
});
