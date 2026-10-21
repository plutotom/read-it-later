import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  queued: [] as { url: string }[],
  referenced: new Set<string>(),
  deleted: vi.fn(),
  end: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ del: mocks.deleted }));
vi.mock("./lib/load-project-env.mjs", () => ({
  loadProjectEnv: () => undefined,
}));
vi.mock("postgres", () => ({
  default: () =>
    Object.assign(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        if (strings.join("").includes("select url")) return mocks.queued;
        if (strings.join("").includes("select id"))
          return mocks.referenced.has(values[0] as string)
            ? [{ id: "saved" }]
            : [];
        return [];
      },
      { end: mocks.end },
    ),
}));
const url =
  "https://example.private.blob.vercel-storage.com/native-speech/" +
  "a".repeat(64) +
  "/00000000-0000-0000-0000-000000000000.ndjson.gz";
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.queued = [];
  mocks.referenced.clear();
  vi.stubEnv("NATIVE_SPEECH_DATABASE_URL", "postgresql://localhost/synthetic");
  vi.stubEnv("NATIVE_SPEECH_BLOB_TOKEN", "synthetic");
});
async function run(apply: boolean) {
  const original = process.argv;
  process.argv = apply
    ? [...original, "--apply"]
    : original.filter((v) => v !== "--apply");
  try {
    await import("./native-speech-maintenance.mjs");
  } finally {
    process.argv = original;
  }
}
describe("shared-store maintenance", () => {
  it("leaves unregistered blobs and explicit stored references untouched", async () => {
    mocks.queued = [{ url }];
    mocks.referenced.add(url);
    await run(true);
    expect(mocks.deleted).not.toHaveBeenCalled();
    expect(mocks.end).toHaveBeenCalled();
  });
  it("defaults to dry-run and only deletes explicitly queued safe private artifacts", async () => {
    mocks.queued = [{ url }, { url: "https://example.com/not-a-speech-blob" }];
    await run(false);
    expect(mocks.deleted).not.toHaveBeenCalled();
    vi.resetModules();
    await run(true);
    expect(mocks.deleted).toHaveBeenCalledTimes(1);
    expect(mocks.deleted.mock.calls[0]?.[0]).toBe(url);
  });
});
