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
  it("only inspects the queue and never deletes blobs", async () => {
    mocks.queued = [{ url }];
    await run(false);
    expect(mocks.deleted).not.toHaveBeenCalled();
    expect(mocks.end).toHaveBeenCalled();
  });
  it("rejects --apply even when a cloned database has no local reference", async () => {
    // Database A still owns this paid URL; its clone B queued it after removal.
    // The CLI cannot see A, so absence from B is never sufficient evidence.
    const databaseA = { stored: new Set([url]) };
    mocks.queued = [{ url }];
    expect(mocks.referenced.has(url)).toBe(false);
    await expect(run(true)).rejects.toThrow(
      "exclusive ownership cannot be proven",
    );
    expect(databaseA.stored.has(url)).toBe(true);
    expect(mocks.deleted).not.toHaveBeenCalled();
  });
});
