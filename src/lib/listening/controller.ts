import { sourceRange, type ListeningDocument } from "./document";
import type { ListeningVoice, WordMark } from "./protocol";
import type { SpeechSource } from "./source";
import type { ListeningTransport, RenderPosition } from "./transport";

export type ListeningState =
  | "idle"
  | "buffering"
  | "playing"
  | "paused"
  | "finished"
  | "error";
export interface ListeningSnapshot {
  state: ListeningState;
  wantsPlayback: boolean;
  segment: number;
  time: number;
  elapsed: number;
  duration: number;
  estimated: boolean;
  voice: ListeningVoice;
  rate: number;
  paragraph: { start: number; end: number } | null;
  word: { start: number; end: number } | null;
  error: string | null;
}
interface AudioRecord {
  parts: Uint8Array[];
  marks: WordMark[];
  bytes: number;
  sent: number;
  duration?: number;
}
export interface ListeningBookmark {
  revision: string;
  voiceId: string;
  segment: number;
  time: number;
  rate: number;
}

/** No React, DOM or network dependencies: all asynchronous boundaries are injectable. */
export class ListeningController {
  private snapshot: ListeningSnapshot;
  private listeners = new Set<() => void>();
  private requests = new Map<number, AbortController>();
  private records = new Map<number, AudioRecord>();
  private prepared = new Set<number>();
  private failedLookahead = new Set<number>();
  private cache = new Map<string, AudioRecord>();
  private durations = new Map<number, number>();
  private epoch = 0;
  private disposed = false;
  private initialized = false;
  private offset = 0;
  private lastBookmark = 0;
  onBookmark: ((bookmark: ListeningBookmark) => void) | null = null;

  constructor(
    readonly articleId: string,
    readonly document: ListeningDocument,
    voice: ListeningVoice,
    private source: SpeechSource,
    private transport: ListeningTransport,
  ) {
    this.snapshot = {
      state: "idle",
      wantsPlayback: false,
      segment: 0,
      time: 0,
      elapsed: 0,
      duration: 0,
      estimated: true,
      voice,
      rate: 1,
      paragraph: null,
      word: null,
      error: null,
    };
    this.publish({});
    transport.onPosition = (position) => this.render(position);
    transport.onError = (message) => this.fail(message);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private key(index: number) {
    return (
      this.snapshot.voice.id + ":" + this.snapshot.voice.model + ":" + index
    );
  }
  private duration(index: number) {
    return (
      this.durations.get(index) ??
      this.document.segments[index]?.estimatedDuration ??
      0
    );
  }
  private publish(update: Partial<ListeningSnapshot>) {
    const next = { ...this.snapshot, ...update };
    let elapsed = next.time,
      duration = 0;
    for (const segment of this.document.segments) {
      const value = this.duration(segment.index);
      duration += value;
      if (segment.index < next.segment) elapsed += value;
    }
    this.snapshot = {
      ...next,
      elapsed,
      duration,
      estimated: this.durations.size < this.document.segments.length,
    };
    for (const listener of this.listeners) listener();
  }
  private bookmark() {
    this.onBookmark?.({
      revision: this.document.revision,
      voiceId: this.snapshot.voice.id,
      segment: this.snapshot.segment,
      time: this.snapshot.time,
      rate: this.snapshot.rate,
    });
  }
  restore(bookmark: ListeningBookmark) {
    if (
      bookmark.revision !== this.document.revision ||
      bookmark.voiceId !== this.snapshot.voice.id ||
      !Number.isInteger(bookmark.segment) ||
      !this.document.segments[bookmark.segment] ||
      !Number.isFinite(bookmark.time) ||
      bookmark.time < 0
    )
      return;
    this.offset = bookmark.time;
    this.setRate(bookmark.rate);
    this.publish({ segment: bookmark.segment, time: bookmark.time });
  }
  private invalidate() {
    this.epoch++;
    for (const request of this.requests.values()) request.abort();
    this.requests.clear();
    this.records.clear();
    this.prepared.clear();
    this.failedLookahead.clear();
    this.initialized = false;
    this.transport.pause();
  }
  async playFrom(index = this.snapshot.segment, offset = 0) {
    if (this.disposed || !this.document.segments[index]) return;
    this.bookmark();
    this.invalidate();
    const epoch = this.epoch;
    this.offset = Math.max(0, offset);
    this.publish({
      state: "buffering",
      wantsPlayback: true,
      segment: index,
      time: this.offset,
      error: null,
      word: null,
      paragraph: null,
    });
    try {
      await this.transport.unlock();
      if (this.disposed || epoch !== this.epoch) return;
      this.transport.reset(index, this.offset);
      this.transport.setRate(this.snapshot.rate);
      this.initialized = true;
      // Pause may have arrived while the browser was unlocking its audio device.
      if (this.snapshot.wantsPlayback) {
        this.transport.play();
        this.schedule();
      }
    } catch (error) {
      if (epoch === this.epoch)
        this.fail(
          error instanceof Error
            ? error.message
            : "Could not start audio playback.",
        );
    }
  }
  async resume() {
    if (this.disposed) return;
    if (this.snapshot.state === "finished") return this.playFrom(0);
    if (!this.initialized || this.snapshot.state === "error")
      return this.playFrom(this.snapshot.segment, this.snapshot.time);
    const epoch = this.epoch;
    this.publish({ wantsPlayback: true, state: "buffering", error: null });
    try {
      await this.transport.unlock();
      if (epoch !== this.epoch || !this.snapshot.wantsPlayback || this.disposed)
        return;
      this.transport.play();
      this.schedule();
    } catch (error) {
      if (epoch === this.epoch)
        this.fail(
          error instanceof Error ? error.message : "Could not resume playback.",
        );
    }
  }
  pause() {
    if (this.disposed) return;
    this.transport.pause();
    this.publish({
      wantsPlayback: false,
      state: this.snapshot.state === "idle" ? "idle" : "paused",
    });
    this.bookmark();
  }
  toggle() {
    if (this.snapshot.wantsPlayback) this.pause();
    else void this.resume();
  }
  setRate(rate: number) {
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 2) return;
    this.transport.setRate(rate);
    this.publish({ rate });
  }
  setVoice(voice: ListeningVoice) {
    if (this.snapshot.voice.id === voice.id) return;
    const playing = this.snapshot.wantsPlayback;
    this.bookmark();
    this.invalidate();
    this.durations.clear();
    this.offset = 0;
    this.publish({
      voice,
      time: 0,
      state: "idle",
      wantsPlayback: false,
      word: null,
      paragraph: null,
      error: null,
    });
    if (playing) void this.playFrom(this.snapshot.segment);
  }
  seek(seconds: number) {
    if (!Number.isFinite(seconds) || !this.document.segments.length) return;
    let remaining = Math.min(
      Math.max(0, seconds),
      Math.max(0, this.snapshot.duration - 0.01),
    );
    let index = 0;
    while (
      index < this.document.segments.length - 1 &&
      remaining >= this.duration(index)
    ) {
      remaining -= this.duration(index);
      index++;
    }
    if (this.snapshot.wantsPlayback) {
      void this.playFrom(index, remaining);
    } else {
      // Moving the playhead is not a request to start billable synthesis.
      this.invalidate();
      this.offset = remaining;
      this.publish({
        segment: index,
        time: remaining,
        state: "paused",
        wantsPlayback: false,
        paragraph: null,
        word: null,
        error: null,
      });
      this.bookmark();
    }
  }
  private appendRemaining(index: number, record: AudioRecord) {
    while (record.sent < record.parts.length)
      this.transport.append(index, record.parts[record.sent++]!);
  }
  private schedule() {
    if (!this.initialized || !this.snapshot.wantsPlayback || this.disposed)
      return;
    const epoch = this.epoch;
    for (
      let index = this.snapshot.segment;
      index <
      Math.min(this.snapshot.segment + 3, this.document.segments.length);
      index++
    ) {
      if (this.failedLookahead.has(index) && index !== this.snapshot.segment)
        continue;
      this.failedLookahead.delete(index);
      if (this.prepared.has(index)) {
        const record = this.records.get(index);
        if (index === this.snapshot.segment && record)
          this.appendRemaining(index, record);
        if (record || this.requests.has(index)) continue;
      } else {
        this.transport.begin(index);
        this.prepared.add(index);
      }
      const cached = this.cache.get(this.key(index));
      if (cached) {
        this.cache.delete(this.key(index));
        this.cache.set(this.key(index), cached);
        const record = { ...cached, sent: 0 };
        this.records.set(index, record);
        this.durations.set(index, record.duration!);
        this.appendRemaining(index, record);
        this.transport.finish(index);
        continue;
      }
      const abort = new AbortController();
      this.requests.set(index, abort);
      const record: AudioRecord = { parts: [], marks: [], bytes: 0, sent: 0 };
      this.records.set(index, record);
      void this.load(index, epoch, record, abort);
    }
  }
  private async load(
    index: number,
    epoch: number,
    record: AudioRecord,
    abort: AbortController,
  ) {
    const segment = this.document.segments[index]!;
    const voice = this.snapshot.voice;
    try {
      for await (const event of this.source.stream(
        {
          articleId: this.articleId,
          revision: this.document.revision,
          segment: index,
          voiceId: voice.id,
        },
        abort.signal,
      )) {
        if (epoch !== this.epoch || abort.signal.aborted || this.disposed)
          return;
        if (event.type === "audio") {
          record.parts.push(event.data);
          record.bytes += event.data.length;
          if (index === this.snapshot.segment)
            this.appendRemaining(index, record);
        } else if (event.type === "marks") {
          if (
            event.marks.some(
              (mark) => mark.offset + mark.length > segment.text.length,
            )
          )
            throw new Error("Speech timestamps do not match the article text.");
          record.marks.push(...event.marks);
        } else {
          record.duration = event.duration;
          this.durations.set(index, event.duration);
          this.cache.set(this.key(index), record);
          this.trimCache();
          this.appendRemaining(index, record);
          this.transport.finish(index);
          this.publish({});
        }
      }
      if (epoch !== this.epoch || this.disposed) return;
      if (record.duration === undefined)
        throw new Error(
          "The speech connection ended early. Retry this paragraph.",
        );
    } catch (error) {
      if (epoch !== this.epoch || abort.signal.aborted || this.disposed) return;
      this.records.delete(index);
      this.failedLookahead.add(index);
      if (index === this.snapshot.segment)
        this.fail(
          error instanceof Error ? error.message : "Speech generation failed.",
        );
      // Lookahead failures are retried only when the segment becomes current.
    } finally {
      if (epoch === this.epoch) this.requests.delete(index);
    }
  }
  private trimCache() {
    let bytes = [...this.cache.values()].reduce(
      (sum, record) => sum + record.bytes,
      0,
    );
    for (const [key, record] of this.cache) {
      if (bytes <= 16_000_000) break;
      this.cache.delete(key);
      bytes -= record.bytes;
    }
  }
  private render(position: RenderPosition) {
    if (this.disposed || !this.initialized || !this.snapshot.wantsPlayback)
      return;
    const segment = this.document.segments[position.segment];
    if (!segment || !this.prepared.has(position.segment)) return;
    const record = this.records.get(position.segment);
    const time =
      position.waiting &&
      position.time < this.offset &&
      position.segment === this.snapshot.segment
        ? this.offset
        : position.time;
    const mark = record?.marks.find(
      (mark) => time >= mark.start && time < mark.end,
    );
    const paragraph = this.document.paragraphs[segment.paragraph] ?? null;
    const finished =
      position.ended && position.segment === this.document.segments.length - 1;
    this.publish({
      segment: position.segment,
      time,
      state: finished ? "finished" : position.waiting ? "buffering" : "playing",
      wantsPlayback: !finished,
      paragraph: finished ? null : paragraph,
      word:
        mark && !finished
          ? sourceRange(segment, mark.offset, mark.length)
          : null,
    });
    if (finished) {
      this.transport.pause();
      this.bookmark();
    } else {
      this.schedule();
      for (const index of this.records.keys())
        if (index < position.segment) this.records.delete(index);
      if (Date.now() - this.lastBookmark > 5000) {
        this.lastBookmark = Date.now();
        this.bookmark();
      }
    }
  }
  private fail(message: string) {
    this.invalidate();
    this.publish({
      state: "error",
      wantsPlayback: false,
      error: message,
      word: null,
    });
    this.bookmark();
  }
  dispose() {
    this.bookmark();
    this.invalidate();
    this.disposed = true;
    this.transport.onPosition = null;
    this.transport.onError = null;
    this.transport.dispose();
    this.listeners.clear();
    this.cache.clear();
  }
}
