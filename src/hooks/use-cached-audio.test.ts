// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { STORAGE_EVENT } from "~/lib/browser-audio-storage";
import { useCachedAudio } from "./use-cached-audio";

const storage = vi.hoisted(() => ({ owner: "test-user", get: vi.fn() }));
vi.mock("~/app/_components/browser-storage-provider", () => ({
  useBrowserStorage: () => storage,
}));

const audioRef = { current: null };
let container: HTMLDivElement;
let root: Root;

function Player({ url }: { url: string }) {
  const audio = useCachedAudio(url, "Test audio", audioRef);
  return createElement(
    "button",
    { disabled: audio.downloaded },
    audio.downloaded ? "Kept" : "Keep audio",
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  storage.get.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("ignores an old article's storage refresh after switching articles", async () => {
  await act(async () => {
    root.render(createElement(Player, { url: "https://example.test/a.mp3" }));
  });

  let finishRefresh!: (file: { blob: Blob; downloaded: boolean }) => void;
  storage.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRefresh = resolve;
      }),
  );
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent(STORAGE_EVENT, {
        detail: { owner: storage.owner, kind: "update" },
      }),
    );
  });

  await act(async () => {
    root.render(createElement(Player, { url: "https://example.test/b.mp3" }));
  });
  expect(container.querySelector("button")?.disabled).toBe(false);

  await act(async () => {
    finishRefresh({ blob: new Blob(["audio"]), downloaded: true });
  });
  expect(container.querySelector("button")?.disabled).toBe(false);
  expect(container.textContent).toBe("Keep audio");

  storage.get.mockResolvedValueOnce({
    blob: new Blob(["audio"]),
    downloaded: true,
  });
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent(STORAGE_EVENT, {
        detail: { owner: storage.owner, kind: "update" },
      }),
    );
  });
  expect(container.querySelector("button")?.disabled).toBe(true);
  expect(container.textContent).toBe("Kept");
});
