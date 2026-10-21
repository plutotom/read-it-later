import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BrowserAudioStorage,
  DEFAULT_CACHE_LIMIT,
} from "./browser-audio-storage";

const url = (id: string) =>
  `https://fixture.public.blob.vercel-storage.com/${id}.mp3`;
const audio = () => new Response(new Blob(["1234"], { type: "audio/mpeg" }));

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => audio()),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("browser audio storage", () => {
  it("recovers from browser quota pressure without evicting intentional downloads", async () => {
    const storage = new BrowserAudioStorage("quota");
    await storage.save(url("old"), "Old");
    await storage.save(url("pin"), "Pinned", true);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Invoked below with the original object store via .call.
    const put = IDBObjectStore.prototype.put;
    let full = true;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === "files" && full) {
        full = false;
        throw new DOMException("Full", "QuotaExceededError");
      }
      return put.call(this, value, key);
    });
    expect(await storage.save(url("new"), "New")).toBe(true);
    expect(await storage.get(url("old"))).toBeUndefined();
    expect(await storage.get(url("pin"))).toMatchObject({ downloaded: true });
    expect(await storage.get(url("new"))).toBeDefined();
  });

  it("expires only temporary audio while keeping downloaded audio", async () => {
    const storage = new BrowserAudioStorage("expiry");
    await storage.save(url("old"), "Old");
    await storage.save(url("pin"), "Pinned", true);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 29 * 86400000);
    expect((await storage.stats()).cacheBytes).toBe(0);
    expect((await storage.stats()).downloadBytes).toBe(4);
  });
  it("persists limits and evicts least recently used temporary files immediately", async () => {
    const storage = new BrowserAudioStorage("one");
    expect((await storage.stats()).limit).toBe(DEFAULT_CACHE_LIMIT);
    await storage.setLimit(8);
    await storage.save(url("a"), "A");
    await storage.save(url("b"), "B");
    await storage.get(url("a"));
    await storage.save(url("c"), "C");
    expect(await storage.get(url("b"))).toBeUndefined();
    expect(await storage.get(url("a"))).toBeDefined();
    expect(await storage.get(url("c"))).toBeDefined();
    await storage.setLimit(4);
    expect((await storage.stats()).cacheBytes).toBe(4);
    const reopened = new BrowserAudioStorage("one");
    expect((await reopened.stats()).limit).toBe(4);
    await reopened.setLimit(0);
    await reopened.save(url("d"), "D");
    expect((await reopened.stats()).cacheBytes).toBe(8);
  });

  it("preserves chosen downloads when trimming or clearing cache, and removes them only with clear-all", async () => {
    const storage = new BrowserAudioStorage("one");
    await storage.save(url("download"), "Download", true);
    await storage.save(url("cache"), "Cache");
    await storage.setLimit(1);
    expect((await storage.stats()).downloadBytes).toBe(4);
    await storage.clear();
    expect(await storage.get(url("download"))).toMatchObject({
      downloaded: true,
    });
    await storage.clear(true);
    expect((await storage.stats()).downloadCount).toBe(0);
    expect((await storage.stats()).limit).toBe(1);
  });

  it("isolates accounts and serializes concurrent writes from different tabs", async () => {
    const first = new BrowserAudioStorage("one");
    const otherTab = new BrowserAudioStorage("one");
    const second = new BrowserAudioStorage("two");
    await first.setLimit(4);
    await Promise.all([
      first.save(url("a"), "A"),
      otherTab.save(url("b"), "B"),
    ]);
    expect((await first.stats()).cacheBytes).toBe(4);
    expect((await second.stats()).cacheBytes).toBe(0);
    await second.save(url("a"), "Other account", true);
    await first.clear(true);
    expect((await second.stats()).downloadBytes).toBe(4);
  });

  it("fences a late network response after another tab clears storage", async () => {
    let release!: (response: Response) => void;
    let started!: () => void;
    const fetching = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        started();
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }),
    );
    const first = new BrowserAudioStorage("one");
    const otherTab = new BrowserAudioStorage("one");
    const save = first.save(url("late"), "Late");
    await fetching;
    await otherTab.clear(true);
    release(audio());
    expect(await save).toBe(false);
    expect((await first.stats()).cacheBytes).toBe(0);
  });

  it("deduplicates downloads and promotes a cached file without fetching again", async () => {
    const storage = new BrowserAudioStorage("one");
    await Promise.all([
      storage.save(url("a"), "A"),
      storage.save(url("a"), "A"),
    ]);
    await storage.save(url("a"), "A", true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await storage.stats()).toMatchObject({
      cacheBytes: 0,
      downloadBytes: 4,
      downloadCount: 1,
    });
  });

  it("keeps browser storage failure separate from playback and rejects partial or unrelated files", async () => {
    const storage = new BrowserAudioStorage("one");
    expect(
      await storage.save("https://unrelated.example/audio.mp3", "No"),
    ).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("12", {
            status: 206,
            headers: { "content-type": "audio/mpeg" },
          }),
      ),
    );
    await expect(storage.save(url("partial"), "Partial")).rejects.toThrow(
      "Could not download",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("Full", "QuotaExceededError");
      }),
    );
    await expect(storage.save(url("full"), "Full", true)).rejects.toThrow(
      "Full",
    );
    expect((await storage.stats()).downloadBytes).toBe(0);
  });
});
