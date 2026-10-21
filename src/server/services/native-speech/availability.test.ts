import { afterEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ enabled: undefined as string | undefined }));
vi.mock("~/env", () => ({
  env: {
    get NATIVE_SPEECH_ENABLED() {
      return config.enabled;
    },
    // A configured provider must not accidentally enable the native API.
    SPEECHIFY_API_KEY: "fixture-only",
  },
}));
vi.mock("./cache", () => {
  throw new Error("Disabled routes must not load database or Blob storage");
});
vi.mock("./generation", () => {
  throw new Error("Disabled routes must not load generation");
});

import { GET as voices } from "~/app/api/native/speech/voices/route";
import { POST as stream } from "~/app/api/native/speech/stream/route";
import {
  GET as read,
  DELETE as remove,
} from "~/app/api/native/speech/cache/[id]/route";
import { nativeSpeechUnavailable } from "./availability";

afterEach(() => {
  config.enabled = undefined;
});

describe("native speech deployment opt-in", () => {
  it.each([undefined, "false", "1", "TRUE"])(
    "blocks every route before input, storage, or generation when enabled=%s",
    async (enabled) => {
      config.enabled = enabled;
      const context = { params: Promise.resolve({ id: "a".repeat(64) }) };
      const responses = [
        voices(),
        await stream(
          new Request("https://example.org/api/native/speech/stream", {
            method: "POST",
            body: "invalid input is not parsed while disabled",
          }),
        ),
        await read(
          new Request("https://example.org/cache/id?status=1"),
          context,
        ),
        await read(new Request("https://example.org/cache/id"), context),
        await remove(
          new Request("https://example.org/cache/id", { method: "DELETE" }),
          context,
        ),
      ];
      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(await response.json()).toEqual({ code: "not_found" });
      }
    },
  );

  it("allows the explicitly enabled private prototype to list configured voices", async () => {
    config.enabled = "true";
    expect(nativeSpeechUnavailable()).toBeNull();
    const response = voices();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      protocol: number;
      mode: string;
      voices: unknown[];
    };
    expect(body.protocol).toBe(1);
    expect(body.mode).toBe("unrestricted-prototype");
    expect(body.voices.length).toBeGreaterThan(0);
  });
});
