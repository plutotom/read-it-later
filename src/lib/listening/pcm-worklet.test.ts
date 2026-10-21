import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

interface Processor {
  command(data: Record<string, unknown>): void;
  process(inputs: unknown[], outputs: Float32Array[][]): boolean;
  items: { cursor: number; frames: number }[];
  port: {
    postMessage: ReturnType<
      typeof vi.fn<(value: { segment: number; time: number }) => void>
    >;
  };
}
function renderer() {
  let Constructor: new () => Processor;
  runInNewContext(readFileSync("public/listening/pcm-worklet.js", "utf8"), {
    AudioWorkletProcessor: class {
      port = { postMessage: vi.fn() };
    },
    registerProcessor: (_name: string, value: new () => Processor) => {
      Constructor = value;
    },
    sampleRate: 48000,
    Float32Array,
    Uint8Array,
    DataView,
  });
  const processor = new Constructor!();
  const send = (type: string, data: object = {}) =>
    processor.command({ epoch: 1, type, ...data });
  send("reset", { segment: 0, offset: 0, rate: 1 });
  send("begin", { segment: 0 });
  const render = (blocks = 1) => {
    let output = new Float32Array(128);
    for (let i = 0; i < blocks; i++) {
      output = new Float32Array(128);
      processor.process([], [[output]]);
    }
    return output;
  };
  return { processor, send, render };
}
describe("audio thread rendering", () => {
  it("advances by actual PCM frames and freezes its cursor on pause and underrun", () => {
    const { processor, send, render } = renderer();
    send("audio", { segment: 0, bytes: new Uint8Array(48000) });
    send("play");
    render(375);
    expect(processor.items[0]!.cursor).toBe(24000);
    render(100);
    expect(processor.items[0]!.cursor).toBe(24000);
    send("audio", { segment: 0, bytes: new Uint8Array(48000) });
    send("pause");
    render(100);
    expect(processor.items[0]!.cursor).toBe(24000);
    send("play");
    render(375);
    expect(processor.items[0]!.cursor).toBe(48000);
  });
  it("reassembles samples split across odd byte chunks and ignores old epochs", () => {
    const { processor, send, render } = renderer();
    send("audio", { segment: 0, bytes: new Uint8Array([0]) });
    send("audio", { segment: 0, bytes: new Uint8Array([64, 0, 64]) });
    send("audio", { epoch: 0, segment: 0, bytes: new Uint8Array(1000) });
    send("complete", { segment: 0 });
    send("play");
    expect(processor.items[0]!.frames).toBe(2);
    expect(render()[0]).toBe(0.5);
  });
  it("seeks without consuming unavailable audio and transitions between queued segments", () => {
    const { processor, send, render } = renderer();
    send("reset", { segment: 3, offset: 0.5, rate: 2 });
    send("begin", { segment: 3 });
    send("play");
    render(100);
    expect(processor.items[0]!.cursor).toBe(12000);
    send("audio", { segment: 3, bytes: new Uint8Array(48000) });
    send("complete", { segment: 3 });
    send("begin", { segment: 4 });
    send("audio", { segment: 4, bytes: new Uint8Array(48000) });
    send("complete", { segment: 4 });
    render(300);
    expect(
      processor.port.postMessage.mock.calls.some(
        ([value]) => value.segment === 4 && value.time > 0,
      ),
    ).toBe(true);
  });
});
