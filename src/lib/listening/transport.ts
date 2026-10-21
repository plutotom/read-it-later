import type { SoundTouchNode } from "@soundtouchjs/audio-worklet";

export interface RenderPosition {
  segment: number;
  time: number;
  waiting: boolean;
  ended: boolean;
}
export interface ListeningTransport {
  onPosition: ((position: RenderPosition) => void) | null;
  onError: ((message: string) => void) | null;
  unlock(): Promise<void>;
  reset(segment: number, offset: number): void;
  begin(segment: number): void;
  append(segment: number, bytes: Uint8Array): void;
  finish(segment: number): void;
  play(): void;
  pause(): void;
  setRate(rate: number): void;
  dispose(): void;
}

/**
 * PCM is rendered on the audio thread. Its cursor stops on underruns and pause;
 * React timers and network arrival times are never used as the media clock.
 */
export class BrowserSpeechTransport implements ListeningTransport {
  onPosition: ListeningTransport["onPosition"] = null;
  onError: ListeningTransport["onError"] = null;
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private pitch: SoundTouchNode | null = null;
  private ready: Promise<void> | null = null;
  private epoch = 0;
  private disposed = false;
  private rate = 1;
  private createPitch: (() => SoundTouchNode) | null = null;
  private endedAt: number | null = null;

  unlock(): Promise<void> {
    if (this.disposed)
      return Promise.reject(new Error("The audio player has closed."));
    // Create and resume synchronously in the user's click, before awaiting modules.
    this.context ??= new AudioContext({ latencyHint: "playback" });
    const context = this.context;
    const resumed = context.resume();
    this.ready ??= (async () => {
      const { SoundTouchNode } = await import("@soundtouchjs/audio-worklet");
      await Promise.all([
        context.audioWorklet.addModule("/listening/pcm-worklet.js"),
        SoundTouchNode.register(context, "/listening/soundtouch-processor.js"),
      ]);
      if (this.disposed) return;
      const pitch = new SoundTouchNode({ context, outputChannelCount: 1 });
      this.createPitch = () =>
        new SoundTouchNode({ context, outputChannelCount: 1 });
      const node = new AudioWorkletNode(context, "ril-listening-pcm", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      node.connect(pitch);
      pitch.connect(context.destination);
      this.node = node;
      this.pitch = pitch;
      pitch.playbackRate.value = this.rate;
      node.onprocessorerror = () =>
        this.onError?.("The audio renderer stopped. Retry this paragraph.");
      pitch.onprocessorerror = node.onprocessorerror;
      node.port.onmessage = ({
        data,
      }: MessageEvent<RenderPosition & { epoch: number }>) => {
        if (data.epoch !== this.epoch || this.disposed) return;
        // Pitch correction has a short processing tail after source EOF.
        if (data.ended) this.endedAt ??= context.currentTime;
        else this.endedAt = null;
        // Account for hardware output latency. The render cursor remains the authority.
        const latency =
          (context.outputLatency || context.baseLatency || 0) * this.rate;
        this.onPosition?.({
          ...data,
          time: Math.max(0, data.time - latency),
          ended: data.ended && context.currentTime - this.endedAt! >= 0.25,
        });
      };
    })().catch((error) => {
      this.ready = null;
      throw error;
    });
    return Promise.all([resumed, this.ready]).then(() => undefined);
  }
  private send(message: object, transfer: Transferable[] = []) {
    this.node?.port.postMessage({ ...message, epoch: this.epoch }, transfer);
  }
  reset(segment: number, offset: number) {
    this.epoch++;
    this.endedAt = null;
    this.send({ type: "reset", segment, offset, rate: this.rate });
    // Drop pitch correction's old tail so a seek never leaks previous speech.
    if (this.node && this.createPitch && this.context) {
      this.node.disconnect();
      this.pitch?.disconnect();
      this.pitch?.port.close();
      this.pitch = this.createPitch();
      this.pitch.playbackRate.value = this.rate;
      this.pitch.onprocessorerror = this.node.onprocessorerror;
      this.node.connect(this.pitch);
      this.pitch.connect(this.context.destination);
    }
  }
  begin(segment: number) {
    this.send({ type: "begin", segment });
  }
  append(segment: number, bytes: Uint8Array) {
    const copy = bytes.slice();
    this.send({ type: "audio", segment, bytes: copy }, [copy.buffer]);
  }
  finish(segment: number) {
    this.send({ type: "complete", segment });
  }
  play() {
    this.send({ type: "play" });
    void this.context
      ?.resume()
      .catch(() => this.onError?.("Tap play to resume audio in this browser."));
  }
  pause() {
    this.send({ type: "pause" });
    void this.context?.suspend().catch(() => undefined);
  }
  setRate(rate: number) {
    this.rate = rate;
    if (this.pitch) this.pitch.playbackRate.value = rate;
    this.send({ type: "rate", rate });
  }
  dispose() {
    this.disposed = true;
    this.node?.disconnect();
    this.pitch?.disconnect();
    this.node?.port.close();
    this.pitch?.port.close();
    void this.context?.close().catch(() => undefined);
    this.node = null;
    this.pitch = null;
  }
}
