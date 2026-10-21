import { beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { PgDialect } from "drizzle-orm/pg-core";
import { createListeningDocument } from "~/lib/listening/document";
import type { ListeningEvent, ListeningVoice } from "~/lib/listening/protocol";

const mocks = vi.hoisted(() => ({
  enabled: "true",
  session: vi.fn(),
  article: vi.fn(),
  preference: vi.fn(),
  reserve: vi.fn(),
}));
vi.mock("~/server/auth", () => ({
  auth: { api: { getSession: mocks.session } },
}));
vi.mock("~/server/db", () => ({
  db: {
    query: {
      articles: { findFirst: mocks.article },
      userPreferences: { findFirst: mocks.preference },
    },
  },
}));
vi.mock("~/env", () => ({
  env: {
    get WEB_SPEECH_ENABLED() {
      return mocks.enabled;
    },
    TTS_VOICE_NAME: "en-US-Chirp3-HD-Charon",
  },
}));
vi.mock("./quota", () => ({ reserveListeningUsage: mocks.reserve }));
import {
  generateListeningArtifact,
  listeningArtifactId,
  listeningCatalog,
  listeningStream,
} from "./stream";

const voice: ListeningVoice = {
  id: "google:en-US-Chirp3-HD-Charon",
  name: "Charon",
  model: "chirp3-hd-pcm24-v1",
  provider: "google",
  wordTimings: false,
};
const content = "<p>First paragraph.</p><p>Play from here.</p>";
const revision = createListeningDocument(
  new JSDOM(content).window.document.body,
).revision;
const input = {
  articleId: "28f286ae-bb8a-440d-8873-279caedb608c",
  revision,
  segment: 1,
  voiceId: voice.id,
};
const request = (value: unknown = input, origin = "https://app.example") =>
  new Request("https://app.example/api/listening/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = "true";
  mocks.session.mockResolvedValue({ user: { id: "owner" } });
  mocks.article.mockResolvedValue({ content });
  mocks.preference.mockResolvedValue(undefined);
});
describe("authenticated listening boundary", () => {
  it("disables streaming without touching article data or admitting generation", async () => {
    mocks.enabled = "false";
    const catalog = await listeningCatalog(request());
    expect(catalog.status).toBe(200);
    expect(await catalog.json()).toMatchObject({ enabled: false, voices: [] });
    expect((await listeningStream(request())).status).toBe(404);
    expect(mocks.preference).not.toHaveBeenCalled();
    expect(mocks.article).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("requires a session before reading articles or admitting generation", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await listeningStream(request())).status).toBe(401);
    expect((await listeningCatalog(request())).status).toBe(401);
    expect(mocks.article).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("checks origin, ownership, revision, segment and an allowlisted voice", async () => {
    expect(
      (await listeningStream(request(input, "https://foreign.example"))).status,
    ).toBe(403);
    mocks.article.mockResolvedValueOnce(undefined);
    expect((await listeningStream(request())).status).toBe(404);
    const query = mocks.article.mock.calls[0]![0] as {
      where: Parameters<PgDialect["sqlToQuery"]>[0];
    };
    expect(new PgDialect().sqlToQuery(query.where).params).toEqual([
      input.articleId,
      "owner",
    ]);
    expect(
      (await listeningStream(request({ ...input, revision: "changed" })))
        .status,
    ).toBe(409);
    expect(
      (await listeningStream(request({ ...input, segment: 999 }))).status,
    ).toBe(400);
    expect(
      (await listeningStream(request({ ...input, voiceId: "arbitrary-model" })))
        .status,
    ).toBe(409);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("uses saved article content and fails before billing if private storage is missing", async () => {
    const response = await listeningStream(
      request({ ...input, text: "Client supplied text is ignored." }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "storage_not_configured",
    });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("defaults to Google and advertises timing capabilities truthfully", async () => {
    const response = await listeningCatalog(request());
    const body = (await response.json()) as {
      defaultVoice: string;
      voices: ListeningVoice[];
    };
    expect(body.defaultVoice).toBe(voice.id);
    expect(
      body.voices.every((v) => v.provider === "google" && !v.wordTimings),
    ).toBe(true);
  });
  it("isolates cache identities by owner, voice and model and rejects prototype-style IDs", () => {
    const id = listeningArtifactId("owner", "Text", voice);
    expect(id).toHaveLength(64);
    expect(id).toMatch(/^w[a-f0-9]{63}$/);
    expect(id).not.toMatch(/^[a-f0-9]{64}$/);
    expect(id).not.toBe(listeningArtifactId("other", "Text", voice));
    expect(id).not.toBe(
      listeningArtifactId("owner", "Text", { ...voice, model: "changed" }),
    );
  });
});

function store() {
  return {
    acquire: vi.fn(async () => true),
    renew: vi.fn(async () => true),
    status: vi.fn(async () => undefined),
    read: vi.fn(async () => undefined),
    save: vi.fn(async () => true),
    fail: vi.fn(async () => undefined),
  };
}
describe("stream generation lifecycle", () => {
  it("delivers audio and render EOF while durable persistence is blocked", async () => {
    const events: ListeningEvent[] = [];
    const cache = store();
    let release!: (saved: boolean) => void;
    cache.save = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );
    const job = generateListeningArtifact({
      id: "id",
      fence: "fence",
      requestId: "request",
      text: "Hello",
      voice,
      store: cache,
      emit: (e) => events.push(e),
      provider: {
        async *stream() {
          yield { type: "audio", data: Buffer.alloc(48000).toString("base64") };
          yield { type: "complete", duration: 1 };
        },
      },
    });
    await vi.waitFor(() => expect(cache.save).toHaveBeenCalled());
    expect(events.map((e) => e.type)).toEqual(["start", "audio", "complete"]);
    release(true);
    await job;
    expect(cache.fail).not.toHaveBeenCalled();
  });
  it("does not cache truncated audio or expose provider error details", async () => {
    const events: ListeningEvent[] = [],
      cache = store();
    await generateListeningArtifact({
      id: "id",
      fence: "fence",
      requestId: "request",
      text: "Hello",
      voice,
      store: cache,
      emit: (e) => events.push(e),
      provider: {
        async *stream() {
          yield { type: "audio", data: "AAA=" };
          throw new Error("private upstream credentials detail");
        },
      },
    });
    expect(events.at(-1)).toEqual({
      type: "error",
      code: "generation_failed",
      message: "Speech generation failed. Retry this paragraph.",
    });
    expect(cache.save).not.toHaveBeenCalled();
    expect(cache.fail).toHaveBeenCalledWith("id", "fence");
  });
  it("rejects invalid PCM duration before sending completion", async () => {
    const events: ListeningEvent[] = [],
      cache = store();
    await generateListeningArtifact({
      id: "id",
      fence: "fence",
      requestId: "request",
      text: "Hello",
      voice,
      store: cache,
      emit: (e) => events.push(e),
      provider: {
        async *stream() {
          yield { type: "audio", data: Buffer.alloc(48000).toString("base64") };
          yield { type: "complete", duration: 2 };
        },
      },
    });
    expect(events.at(-1)).toMatchObject({
      type: "error",
      code: "incomplete_audio",
    });
    expect(cache.save).not.toHaveBeenCalled();
  });
});
