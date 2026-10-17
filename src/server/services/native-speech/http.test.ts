import { describe, expect, it, vi } from "vitest";
vi.mock("~/env", () => ({
  env: {
    SPEECHIFY_API_KEY: "test",
    INWORLD_API_KEY: "test",
    NATIVE_SPEECH_BLOB_STORE_ID: "test-store",
    NATIVE_SPEECH_PROVIDER: "speechify",
  },
}));
import { catalog, configured, readBody } from "./http";
describe("native speech configuration boundary", () => {
  it("accepts each resolved catalog voice independent of property order", () => {
    for (const voice of catalog()) {
      const descriptor = Object.fromEntries(
        Object.entries(voice.descriptor).reverse(),
      ) as typeof voice.descriptor;
      expect(() => configured(descriptor)).not.toThrow();
      expect(() =>
        configured({ ...descriptor, model: "arbitrary-model" }),
      ).toThrow("configuration is unavailable");
    }
  });
  it("requires JSON and bounds request bodies before parsing", async () => {
    await expect(
      readBody(
        new Request("https://example.org", { method: "POST", body: "{}" }),
      ),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readBody(
        new Request("https://example.org", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "x".repeat(32_001),
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
});
