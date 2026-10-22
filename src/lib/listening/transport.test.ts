import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserSpeechTransport } from "./transport";

vi.mock("@soundtouchjs/audio-worklet", () => ({
  SoundTouchNode: class {
    static register = vi.fn(async () => undefined);
    playbackRate = { value: 1 };
    port = { close: vi.fn() };
    connect = vi.fn();
    disconnect = vi.fn();
  },
}));

function setup(session?: { type: string }) {
  const events: string[] = [];
  const context = {
    audioWorklet: { addModule: vi.fn(async () => undefined) },
    destination: {},
    resume: vi.fn(async () => {
      events.push("resume:" + session?.type);
    }),
    suspend: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  vi.stubGlobal("navigator", session ? { audioSession: session } : {});
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        events.push("create:" + session?.type);
        return context;
      }
    },
  );
  vi.stubGlobal(
    "AudioWorkletNode",
    class {
      port = { postMessage: vi.fn(), close: vi.fn() };
      connect = vi.fn();
      disconnect = vi.fn();
    },
  );
  const transport = new BrowserSpeechTransport();
  return { transport, context, events };
}

afterEach(() => vi.unstubAllGlobals());

describe("browser speech playback session", () => {
  it("claims media playback synchronously before creating or resuming Web Audio", async () => {
    const session = { type: "auto" };
    const { transport, events } = setup(session);
    expect(session.type).toBe("auto");

    const unlocked = transport.unlock();
    // iOS needs the playback category and resume inside the user's gesture,
    // before the worklet imports/registration or speech fetch can finish.
    expect(session.type).toBe("playback");
    expect(events).toEqual(["create:playback", "resume:playback"]);
    await unlocked;
    transport.dispose();
    expect(session.type).toBe("auto");
  });

  it("keeps the playback category while paused and reclaims it on resume", async () => {
    const session = { type: "ambient" };
    const { transport, events, context } = setup(session);
    await transport.unlock();
    transport.play();
    transport.pause();
    expect(context.suspend).toHaveBeenCalledOnce();
    expect(session.type).toBe("playback");

    session.type = "auto";
    await transport.unlock();
    expect(events.at(-1)).toBe("resume:playback");
    expect(events.filter((event) => event.startsWith("create:"))).toHaveLength(
      1,
    );
    transport.dispose();
    expect(session.type).toBe("ambient");
  });

  it("plays normally when the browser has no Audio Session API", async () => {
    const { transport, context } = setup();
    await transport.unlock();
    transport.play();
    expect(context.resume).toHaveBeenCalledTimes(2);
    transport.dispose();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("does not overwrite another audio session choice during cleanup", async () => {
    const session = { type: "auto" };
    const { transport } = setup(session);
    await transport.unlock();
    session.type = "play-and-record";
    transport.dispose();
    expect(session.type).toBe("play-and-record");
  });

  it("does not claim playback when a disposed player is unlocked", async () => {
    const session = { type: "auto" };
    const { transport, events } = setup(session);
    transport.dispose();
    await expect(transport.unlock()).rejects.toThrow("closed");
    expect(session.type).toBe("auto");
    expect(events).toEqual([]);
  });
});
