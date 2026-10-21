import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  synthesize:
    vi.fn<
      (
        request: unknown,
        options: { retry: null; timeout: number },
      ) => Promise<{ audioContent: Buffer }[]>
    >(),
  close: vi.fn(),
  put: vi.fn<
    (path: string, bytes: Buffer, options: unknown) => Promise<{ url: string }>
  >(),
  begin: vi.fn(),
  finish: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));
vi.mock("~/env", () => ({ env: { BLOB_READ_WRITE_TOKEN: "test-only" } }));
vi.mock("../google-tts-client", () => ({
  getGoogleTTSClient: () => ({
    synthesizeSpeech: mocks.synthesize,
    close: mocks.close,
  }),
}));
vi.mock("@vercel/blob", () => ({ put: mocks.put, del: vi.fn() }));
vi.mock("./ledger", () => ({
  beginAttempt: mocks.begin,
  finishAttempt: mocks.finish,
}));
import { generateAudioForArticle, prepareArticleAudio } from "../tts";
const html =
  "<p>" + "A complete synthetic sentence for audio. ".repeat(350) + "</p>";
const voice = "en-US-Chirp3-HD-Charon";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.begin.mockResolvedValue("attempt");
  mocks.finish.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
});
describe("legacy paid chunk accounting", () => {
  it("records completed and ambiguous chunks when a later call fails", async () => {
    mocks.synthesize
      .mockResolvedValueOnce([{ audioContent: Buffer.alloc(10) }])
      .mockRejectedValueOnce(new Error("upstream timeout"));
    const dispatched = vi.fn();
    await expect(
      generateAudioForArticle("synthetic", html, voice, {
        userId: "owner",
        jobId: "job",
        fence: "fence",
        onDispatched: dispatched,
      }),
    ).rejects.toThrow("timeout");
    expect(mocks.begin).toHaveBeenCalledTimes(2);
    expect(mocks.finish.mock.calls.map((c) => c[1])).toEqual([true, false]);
    expect(dispatched).toHaveBeenCalledTimes(2);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.synthesize.mock.calls.every((c) => c[1].retry === null)).toBe(
      true,
    );
    expect(mocks.close).toHaveBeenCalled();
  });
  it("retries failed persistence with paid bytes without synthesizing again", async () => {
    mocks.synthesize.mockResolvedValue([{ audioContent: Buffer.alloc(10) }]);
    mocks.put.mockRejectedValue(new Error("storage unavailable"));
    const chunks = prepareArticleAudio(html, voice);
    await expect(
      generateAudioForArticle("synthetic", html, voice, {
        userId: "owner",
        jobId: "job",
        fence: "fence",
        onDispatched: vi.fn(),
      }),
    ).rejects.toThrow("storage");
    expect(mocks.synthesize).toHaveBeenCalledTimes(chunks.length);
    expect(mocks.finish.mock.calls.every((c) => c[1] === true)).toBe(true);
    expect(mocks.put).toHaveBeenCalledTimes(3);
    expect(
      mocks.put.mock.calls.every(
        (c) => Buffer.compare(c[1], mocks.put.mock.calls[0]![1]) === 0,
      ),
    ).toBe(true);
  });
});
