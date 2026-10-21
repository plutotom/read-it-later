// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AudioPlayerSeekBar } from "./audio-player-seek-bar";

let container: HTMLDivElement;
let root: Root;
const seek = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  seek.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function mount(commitOnRelease = true, value = 5) {
  await act(async () =>
    root.render(
      createElement(AudioPlayerSeekBar, {
        value,
        max: 100,
        onChange: seek,
        commitOnRelease,
      }),
    ),
  );
  return container.querySelector("input")!;
}
async function event(input: HTMLInputElement, name: string, key?: string) {
  await act(async () => {
    input.dispatchEvent(
      key
        ? new KeyboardEvent(name, { key, bubbles: true })
        : new Event(name, { bubbles: true }),
    );
  });
}
async function change(input: HTMLInputElement, value: number) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("previews pointer scrubbing across playback updates and commits only the final target", async () => {
  const input = await mount();
  await event(input, "pointerdown");
  await change(input, 20);
  await mount(true, 6); // Live playback updates must not move the dragged thumb.
  expect(input.value).toBe("20");
  await change(input, 45);
  await change(input, 80);
  expect(seek).not.toHaveBeenCalled();
  await event(input, "pointerup");
  await event(input, "lostpointercapture");
  await event(input, "focusout");
  expect(seek.mock.calls).toEqual([[80]]);
});

it("commits keyboard adjustment once and accepts assistive changes without a gesture", async () => {
  const input = await mount();
  await event(input, "keydown", "ArrowRight");
  await change(input, 10);
  await event(input, "keydown", "ArrowRight");
  await change(input, 15);
  expect(seek).not.toHaveBeenCalled();
  await event(input, "keyup", "ArrowRight");
  expect(seek.mock.calls).toEqual([[15]]);
  await change(input, 25);
  expect(seek.mock.calls).toEqual([[15], [25]]);
});

it("cancels an interrupted pointer gesture without generating speech", async () => {
  const input = await mount();
  await event(input, "pointerdown");
  await change(input, 70);
  await event(input, "pointercancel");
  await event(input, "lostpointercapture");
  await event(input, "focusout");
  expect(seek).not.toHaveBeenCalled();
  expect(input.value).toBe("5");
});

it("keeps immediate seeking for the legacy recording player", async () => {
  const input = await mount(false);
  await event(input, "pointerdown");
  await change(input, 20);
  await change(input, 40);
  await event(input, "pointerup");
  expect(seek.mock.calls).toEqual([[20], [40]]);
});
