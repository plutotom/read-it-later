// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AudioPlayer } from "./audio-player";

const mocks = vi.hoisted(() => {
  const audio = {
    audioUrl: "https://synthetic.test/paid.mp3",
    durationSeconds: 10,
    currentTimeSeconds: 0,
  };
  return {
    audio,
    status: { hasAudio: true, audio: audio as typeof audio | null },
    recover: vi.fn(),
    regenerate: vi.fn(),
    invalidate: vi.fn(),
    progress: vi.fn(),
    load: vi.fn(),
    confirm: vi.fn(),
  };
});
vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      tts: {
        getStatus: { invalidate: mocks.invalidate },
        getUsage: { invalidate: mocks.invalidate },
      },
    }),
    tts: {
      getStatus: { useQuery: () => ({ data: mocks.status, isLoading: false }) },
      getStatusByShareToken: {
        useQuery: () => ({ data: undefined, isLoading: false }),
      },
      getAudio: { useQuery: () => ({ refetch: mocks.recover }) },
      regenerateAudio: {
        useMutation: () => ({ mutateAsync: mocks.regenerate }),
      },
      updateProgress: { useMutation: () => ({ mutateAsync: mocks.progress }) },
      getVoiceConfig: { useQuery: () => ({ data: undefined }) },
    },
  },
}));
vi.mock("~/hooks/use-cached-audio", () => ({
  useCachedAudio: (url: string) => ({ src: url }),
}));
vi.mock("./audio-player-expanded", () => ({ AudioPlayerExpanded: () => null }));
vi.mock("./audio-player-sheet", () => ({ AudioPlayerSheet: () => null }));
vi.mock("./playback-speed-picker", () => ({ PlaybackSpeedPicker: () => null }));
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  localStorage.clear();
  mocks.status = { hasAudio: true, audio: mocks.audio };
  mocks.recover.mockResolvedValue({ data: mocks.audio });
  mocks.regenerate.mockResolvedValue(mocks.audio);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(mocks.load);
  vi.spyOn(window, "confirm").mockImplementation(mocks.confirm);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () =>
    root.render(
      createElement(AudioPlayer, {
        articleId: "synthetic-article",
        articleTitle: "Synthetic",
        articleUrl: "https://synthetic.test",
      }),
    ),
  );
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === label || b.getAttribute("aria-label") === label,
  );
  expect(button, label).toBeTruthy();
  await act(async () => button!.click());
}
async function mediaError() {
  await act(async () =>
    container.querySelector("audio")!.dispatchEvent(new Event("error")),
  );
}
it("recovers a failed media download using saved audio without regeneration", async () => {
  await mount();
  await mediaError();
  await click("Retry playback");
  expect(mocks.recover).toHaveBeenCalledTimes(1);
  expect(mocks.load).toHaveBeenCalledTimes(1);
  expect(mocks.regenerate).not.toHaveBeenCalled();
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it("recovers after a lost generation response without sending a paid regeneration", async () => {
  mocks.status = { hasAudio: false, audio: null };
  mocks.recover.mockResolvedValueOnce({
    error: new Error("lost response after publication"),
  });
  await mount();
  await click("Generate audio");
  await click("Retry playback");
  expect(mocks.recover).toHaveBeenCalledTimes(2);
  expect(container.querySelector("audio")?.src).toBe(mocks.audio.audioUrl);
  expect(mocks.regenerate).not.toHaveBeenCalled();
});
it("requires explicit confirmation for a separately labelled paid regeneration", async () => {
  await mount();
  await mediaError();
  mocks.confirm.mockReturnValueOnce(false);
  await click("Generate new audio…");
  expect(mocks.regenerate).not.toHaveBeenCalled();
  mocks.confirm.mockReturnValueOnce(true);
  await click("Generate new audio…");
  expect(mocks.regenerate).toHaveBeenCalledTimes(1);
  expect(mocks.confirm).toHaveBeenCalledWith(
    expect.stringContaining("uses your recording allowance"),
  );
  expect(mocks.recover).not.toHaveBeenCalled();
});
